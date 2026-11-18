// Gen timesheet รายเดือนจากไฟล์ต้นแบบ .xlsx
// โค้ดอ่านโครงสร้างต้นแบบ → agent ตอบเป็น JSON ว่ากรอกอะไรลงเซลล์ไหน → โค้ดเขียนลงสำเนาของต้นแบบ
// (agent ไม่แตะไฟล์ xlsx เอง เพื่อไม่ให้ format ของต้นแบบพัง)
import ExcelJS from 'exceljs';
import path from 'node:path';
import { runAgent } from './agent';
import {
  createTimesheet,
  failTimesheet,
  finishTimesheet,
  formatLeaveLine,
  getSettings,
  listDays,
  TEMPLATE_DIR,
  TIMESHEET_DIR,
  type TemplateRow,
} from './db';
import { daysInMonth, hoursBetween, timeOf, weekdayOf } from './time';

const MAX_INSPECT_ROWS = 120;
const MAX_INSPECT_COLS = 40;
const ADDRESS_RE = /^[A-Z]{1,3}[1-9]\d*$/;

function describeValue(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `date ${v.toISOString().slice(0, 10)}`;
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) return `formula =${'formula' in v ? v.formula : v.sharedFormula}`;
    if ('richText' in v) return JSON.stringify(v.richText.map((t) => t.text).join(''));
    if ('text' in v) return JSON.stringify(String(v.text));
    if ('error' in v) return `error ${v.error}`;
    return JSON.stringify(v);
  }
  return JSON.stringify(v);
}

/** สรุปโครงสร้างไฟล์ต้นแบบเป็นข้อความ (ชื่อ sheet, เซลล์ merge, เซลล์ที่มีค่า/สูตร) */
export async function inspectTemplate(file: string): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const lines: string[] = [];
  wb.eachSheet((ws) => {
    lines.push(`Sheet "${ws.name}" (used rows: ${ws.rowCount}, used columns: ${ws.columnCount})`);
    const merges = (ws.model as { merges?: string[] }).merges ?? [];
    if (merges.length) lines.push(`Merged cells: ${merges.join(', ')}`);
    const lastRow = Math.min(ws.rowCount, MAX_INSPECT_ROWS);
    for (let r = 1; r <= lastRow; r++) {
      const cells: string[] = [];
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
        if (col > MAX_INSPECT_COLS) return;
        const d = describeValue(cell.value);
        if (d) cells.push(`${cell.address}: ${d}`);
      });
      if (cells.length) lines.push(`  Row ${r}: ${cells.join(' | ')}`);
    }
    if (ws.rowCount > MAX_INSPECT_ROWS) lines.push(`  … (showing the first ${MAX_INSPECT_ROWS} rows)`);
  });
  return lines.join('\n');
}

/** ตรวจว่าไฟล์เปิดเป็น xlsx ได้ */
export async function validateXlsx(file: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  if (!wb.worksheets.length) throw new Error('The file has no sheets');
}

function dayLogged(d: ReturnType<typeof listDays>[number]): boolean {
  return !!(d.check_in_at || d.check_out_at || d.summary?.trim() || d.leave_type);
}

function buildWorkLog(month: string, _lang: string): string {
  const days = listDays(`${month}-01`, `${month}-31`)
    .filter(dayLogged)
    .reverse();
  if (!days.length) return '(no work logged this month)';
  return days
    .map((d) => {
      const hours = hoursBetween(d.check_in_at, d.check_out_at);
      const head = [
        `### ${d.work_date} (${weekdayOf(d.work_date)})`,
        d.check_in_at ? `check-in ${timeOf(d.check_in_at)}` : 'check-in -',
        d.check_out_at ? `check-out ${timeOf(d.check_out_at)}` : 'check-out -',
        hours !== null ? `hours ${hours}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const leave = formatLeaveLine(d);
      const work = d.summary?.trim() || (leave ? '(no work detail)' : '(no work detail)');
      return leave ? `${head}\n${work}\n${leave}` : `${head}\n${work}`;
    })
    .join('\n\n');
}

function buildPrompt(month: string, structure: string, workLog: string, language: string): string {
  return `You are filling in a monthly timesheet Excel template for a software developer.

Month: ${month} (${daysInMonth(month)} days)
Write descriptions in: ${language}

## Template structure
${structure}

## Work log (only days the developer recorded)
${workLog}

## Instructions
- Work out from the template which cells to fill: e.g. header fields (month, period), one row per day,
  and columns such as date, check-in, check-out, hours and task description.
- Keep the template's labels, styles and formulas. Do not overwrite formula cells.
- Condense each day's work detail to fit the description cell (keep the important tasks).
- Some days include a separate "Leave: …" line (sick/personal/vacation/holiday with hours and optional note). Fill leave into the template's leave/absence columns or notes — do not merge leave into the work description unless the template has only one text field.
- Do not invent leave for days that have no Leave line in the log.
- For days with no work log, follow what the template implies (usually leave blank).
- If the template has fewer day rows than needed, continue in the rows right below.
- Respond with ONLY a JSON object (no prose, no code fences) in this shape:
{"cells":[{"sheet":"<sheet name>","cell":"B5","value": <value>}]}
<value> is one of: a string, a number, {"date":"YYYY-MM-DD"}, {"time":"HH:MM"}, or null to clear the cell.`;
}

interface CellWrite {
  sheet: string;
  cell: string;
  value: unknown;
}

function parseCells(text: string): CellWrite[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`The agent didn't answer with JSON: ${text.slice(0, 300)}`);
  let parsed: { cells?: unknown };
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new Error(`Couldn't parse the agent's JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(parsed.cells)) throw new Error('The agent\'s JSON has no "cells"');
  return parsed.cells as CellWrite[];
}

function applyValue(cell: ExcelJS.Cell, v: unknown): void {
  if (v === null) {
    cell.value = null;
  } else if (typeof v === 'string' || typeof v === 'number') {
    cell.value = v;
  } else if (typeof v === 'object' && v && 'date' in v && /^\d{4}-\d{2}-\d{2}$/.test(String(v.date))) {
    const [y, m, d] = String(v.date).split('-').map(Number);
    cell.value = new Date(Date.UTC(y, m - 1, d)); // exceljs เขียนวันที่แบบ UTC
    if (!cell.numFmt) cell.numFmt = 'yyyy-mm-dd';
  } else if (typeof v === 'object' && v && 'time' in v && /^\d{1,2}:\d{2}$/.test(String(v.time))) {
    const [h, m] = String(v.time).split(':').map(Number);
    cell.value = (h * 60 + m) / 1440; // Excel เก็บเวลาเป็นเศษส่วนของวัน
    if (!cell.numFmt) cell.numFmt = 'hh:mm';
  } else {
    throw new Error(`Invalid value for cell ${cell.address}: ${JSON.stringify(v)}`);
  }
}

async function writeTimesheet(templateFile: string, outFile: string, writes: CellWrite[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templateFile);
  const originalRows = new Map(wb.worksheets.map((ws) => [ws.name, ws.rowCount]));

  for (const w of writes) {
    const ws = wb.getWorksheet(w.sheet);
    if (!ws) throw new Error(`Sheet "${w.sheet}" not found in the template`);
    const addr = String(w.cell).toUpperCase();
    if (!ADDRESS_RE.test(addr)) throw new Error(`Invalid cell address: ${w.cell}`);
    const cell = ws.getCell(addr);
    if (cell.formula) continue; // ไม่เขียนทับสูตรของต้นแบบ

    // แถวที่เกินต้นแบบ: ยืม style จากแถวสุดท้ายของต้นแบบ ให้ตารางต่อกันสวย
    const lastRow = originalRows.get(ws.name) ?? 0;
    if (Number(cell.row) > lastRow && lastRow > 0) {
      cell.style = structuredClone(ws.getCell(lastRow, Number(cell.col)).style);
    }
    applyValue(cell, w.value);
  }
  await wb.xlsx.writeFile(outFile);
}

async function run(id: number, month: string, template: TemplateRow): Promise<void> {
  try {
    const settings = getSettings();
    const templateFile = path.join(TEMPLATE_DIR, template.stored_name);
    const structure = await inspectTemplate(templateFile);
    const prompt = buildPrompt(month, structure, buildWorkLog(month, settings.language), settings.language);
    const answer = await runAgent(prompt, settings, 10 * 60_000);
    const outName = `timesheet-${month}-${id}.xlsx`;
    await writeTimesheet(templateFile, path.join(TIMESHEET_DIR, outName), parseCells(answer));
    finishTimesheet(id, outName);
  } catch (e) {
    failTimesheet(id, e instanceof Error ? e.message : String(e));
  }
}

/** เริ่ม gen timesheet แบบ background คืน id ของงาน */
export function startTimesheet(month: string, template: TemplateRow): number {
  const id = createTimesheet(month, template.id);
  void run(id, month, template);
  return id;
}
