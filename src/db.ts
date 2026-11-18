import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { localDateTime } from './time';

/** โฟลเดอร์เก็บข้อมูลจริง (DB, ไฟล์ต้นแบบ, timesheet) เปลี่ยนได้ด้วย env WORKINGLAB_DATA */
export const DATA_DIR = path.resolve(process.env.WORKINGLAB_DATA ?? path.join(import.meta.dirname, '..', 'data'));
export const TEMPLATE_DIR = path.join(DATA_DIR, 'templates');
export const TIMESHEET_DIR = path.join(DATA_DIR, 'timesheets');
for (const dir of [DATA_DIR, TEMPLATE_DIR, TIMESHEET_DIR]) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'workinglab.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- 1 แถวต่อวัน (เข้า-เลิกงานได้วันละรอบ)
  CREATE TABLE IF NOT EXISTS work_days (
    work_date      TEXT PRIMARY KEY,            -- YYYY-MM-DD
    check_in_at    TEXT,                        -- YYYY-MM-DD HH:MM:SS
    check_out_at   TEXT,
    git_data       TEXT,                        -- JSON ข้อมูล git ดิบที่เก็บตอนเลิกงาน
    summary        TEXT,                        -- work detail
    summary_status TEXT NOT NULL DEFAULT 'none', -- none | running | done | error
    summary_error  TEXT,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    original_name TEXT NOT NULL,
    stored_name   TEXT NOT NULL,
    uploaded_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS timesheets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    month       TEXT NOT NULL,                  -- YYYY-MM
    template_id INTEGER NOT NULL REFERENCES templates(id),
    output_name TEXT,
    status      TEXT NOT NULL,                  -- running | done | error
    error       TEXT,
    created_at  TEXT NOT NULL
  );
`);

// งานที่ค้างสถานะ running ตอน server ปิดไป ถือว่าล้มเหลว (กดใหม่ได้)
const INTERRUPTED = 'Interrupted because the server stopped while it was running. You can start it again.';
db.prepare(`UPDATE work_days SET summary_status = 'error', summary_error = ? WHERE summary_status = 'running'`).run(INTERRUPTED);
db.prepare(`UPDATE timesheets SET status = 'error', error = ? WHERE status = 'running'`).run(INTERRUPTED);

// ---------- settings ----------

export type TargetType = 'single' | 'multi';

/** ภาษาที่เลือกได้สำหรับ work detail / timesheet (ค่านี้ส่งให้ agent ตรง ๆ) */
export const LANGUAGES = ['English', 'Thai'] as const;
export type Language = (typeof LANGUAGES)[number];

export function toLanguage(v: unknown): Language {
  const s = String(v ?? '');
  if ((LANGUAGES as readonly string[]).includes(s)) return s as Language;
  return /ไทย|thai/i.test(s) ? 'Thai' : 'English'; // ค่าเก่าที่เคยพิมพ์เอง
}

/** CLI ที่ใช้สรุปงาน / gen timesheet */
export const AGENT_PROVIDERS = ['claude', 'cursor'] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];

export const AGENT_PROVIDER_META: Record<
  AgentProvider,
  { label: string; defaultCommand: string; hint: string }
> = {
  claude: {
    label: 'Claude Code CLI',
    defaultCommand: 'claude',
    hint: 'Uses your Claude Pro quota via the claude command',
  },
  cursor: {
    label: 'Cursor Agent CLI',
    defaultCommand: 'agent',
    hint: 'Uses your Cursor account via the agent command (install from cursor.com/install)',
  },
};

export function toAgentProvider(v: unknown): AgentProvider {
  const s = String(v ?? '');
  return (AGENT_PROVIDERS as readonly string[]).includes(s) ? (s as AgentProvider) : 'claude';
}

export function defaultAgentCommand(provider: AgentProvider): string {
  return AGENT_PROVIDER_META[provider].defaultCommand;
}

export interface Settings {
  targetPath: string;
  targetType: TargetType;
  /**
   * ชื่อ folder ของ repo ที่ไม่ต้อง scan (ใช้เฉพาะ multi)
   * เก็บเป็นรายการ "ที่ข้าม" ไม่ใช่ "ที่เลือก" เพื่อให้ repo ที่เพิ่มมาใหม่ถูก scan โดยอัตโนมัติ
   */
  excludedRepos: string[];
  /** อีเมล git ของเจ้าของ ว่าง = ใช้ git config user.email ของแต่ละ repo */
  authorEmails: string[];
  /** ภาษาที่ให้ agent เขียน work detail / timesheet */
  language: Language;
  /** เลือก CLI: Claude Code หรือ Cursor Agent */
  agentProvider: AgentProvider;
  /** คำสั่งเรียก CLI — ตั้งจาก provider อัตโนมัติ ไม่ให้พิมพ์เองใน UI */
  agentCommand: string;
}

const DEFAULT_SETTINGS: Settings = {
  targetPath: '',
  targetType: 'multi',
  excludedRepos: [],
  authorEmails: [],
  language: 'Thai',
  agentProvider: 'claude',
  agentCommand: 'claude',
};

export function getSettings(): Settings {
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'app'`).get() as { value: string } | undefined;
  const raw = row ? (JSON.parse(row.value) as Partial<Settings>) : {};
  const agentProvider = toAgentProvider(raw.agentProvider);
  return {
    targetPath: String(raw.targetPath ?? DEFAULT_SETTINGS.targetPath),
    targetType: raw.targetType === 'single' ? 'single' : 'multi',
    excludedRepos: Array.isArray(raw.excludedRepos) ? raw.excludedRepos.map(String) : [],
    authorEmails: Array.isArray(raw.authorEmails) ? raw.authorEmails.map(String) : [],
    language: toLanguage(raw.language),
    agentProvider,
    agentCommand: defaultAgentCommand(agentProvider),
  };
}

export function saveSettings(s: Settings): void {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
    JSON.stringify(s),
  );
}

// ---------- work days ----------

export type SummaryStatus = 'none' | 'running' | 'done' | 'error';

export interface WorkDay {
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  git_data: string | null;
  summary: string | null;
  summary_status: SummaryStatus;
  summary_error: string | null;
  updated_at: string;
}

function ensureDay(date: string): void {
  db.prepare(`INSERT OR IGNORE INTO work_days (work_date, updated_at) VALUES (?, ?)`).run(date, localDateTime());
}

function updateDay(date: string, sets: string, ...params: (string | null)[]): number {
  ensureDay(date);
  const r = db.prepare(`UPDATE work_days SET ${sets}, updated_at = ? WHERE work_date = ?`).run(...params, localDateTime(), date);
  return Number(r.changes);
}

export function getDay(date: string): WorkDay | undefined {
  return db.prepare(`SELECT * FROM work_days WHERE work_date = ?`).get(date) as WorkDay | undefined;
}

/** วันในช่วง [from, to] เรียงใหม่ไปเก่า */
export function listDays(from: string, to: string): WorkDay[] {
  return db
    .prepare(`SELECT * FROM work_days WHERE work_date BETWEEN ? AND ? ORDER BY work_date DESC`)
    .all(from, to) as unknown as WorkDay[];
}

/** คืน false ถ้าวันนั้นเข้างานไปแล้ว */
export function checkIn(date: string, at: string): boolean {
  ensureDay(date);
  const r = db
    .prepare(`UPDATE work_days SET check_in_at = ?, updated_at = ? WHERE work_date = ? AND check_in_at IS NULL`)
    .run(at, localDateTime(), date);
  return Number(r.changes) > 0;
}

/** คืน false ถ้ายังไม่เข้างาน หรือเลิกงานไปแล้ว */
export function checkOut(date: string, at: string): boolean {
  const r = db
    .prepare(
      `UPDATE work_days SET check_out_at = ?, updated_at = ?
       WHERE work_date = ? AND check_in_at IS NOT NULL AND check_out_at IS NULL`,
    )
    .run(at, localDateTime(), date);
  return Number(r.changes) > 0;
}

export function setTimes(date: string, checkInAt: string | null, checkOutAt: string | null): void {
  updateDay(date, `check_in_at = ?, check_out_at = ?`, checkInAt, checkOutAt);
}

export function setSummaryText(date: string, summary: string): void {
  updateDay(date, `summary = ?, summary_status = 'done', summary_error = NULL`, summary);
}

export function markSummaryRunning(date: string): void {
  updateDay(date, `summary_status = 'running', summary_error = NULL`);
}

export function saveGitData(date: string, json: string): void {
  updateDay(date, `git_data = ?`, json);
}

export function finishSummary(date: string, summary: string): void {
  setSummaryText(date, summary);
}

export function failSummary(date: string, error: string): void {
  updateDay(date, `summary_status = 'error', summary_error = ?`, error);
}

// ---------- templates ----------

export interface TemplateRow {
  id: number;
  original_name: string;
  stored_name: string;
  uploaded_at: string;
}

export function addTemplate(originalName: string, storedName: string): number {
  const r = db
    .prepare(`INSERT INTO templates (original_name, stored_name, uploaded_at) VALUES (?, ?, ?)`)
    .run(originalName, storedName, localDateTime());
  return Number(r.lastInsertRowid);
}

/** ไฟล์ต้นแบบที่ใช้อยู่ = ตัวที่อัปโหลดล่าสุด */
export function latestTemplate(): TemplateRow | undefined {
  return db.prepare(`SELECT * FROM templates ORDER BY id DESC LIMIT 1`).get() as TemplateRow | undefined;
}

export function getTemplate(id: number): TemplateRow | undefined {
  return db.prepare(`SELECT * FROM templates WHERE id = ?`).get(id) as TemplateRow | undefined;
}

// ---------- timesheets ----------

export interface TimesheetRow {
  id: number;
  month: string;
  template_id: number;
  template_name: string;
  output_name: string | null;
  status: 'running' | 'done' | 'error';
  error: string | null;
  created_at: string;
}

export function createTimesheet(month: string, templateId: number): number {
  const r = db
    .prepare(`INSERT INTO timesheets (month, template_id, status, created_at) VALUES (?, ?, 'running', ?)`)
    .run(month, templateId, localDateTime());
  return Number(r.lastInsertRowid);
}

export function finishTimesheet(id: number, outputName: string): void {
  db.prepare(`UPDATE timesheets SET status = 'done', output_name = ?, error = NULL WHERE id = ?`).run(outputName, id);
}

export function failTimesheet(id: number, error: string): void {
  db.prepare(`UPDATE timesheets SET status = 'error', error = ? WHERE id = ?`).run(error, id);
}

const TIMESHEET_SELECT = `
  SELECT t.*, tp.original_name AS template_name
  FROM timesheets t JOIN templates tp ON tp.id = t.template_id`;

export function listTimesheets(limit = 30): TimesheetRow[] {
  return db.prepare(`${TIMESHEET_SELECT} ORDER BY t.id DESC LIMIT ?`).all(limit) as unknown as TimesheetRow[];
}

export function getTimesheet(id: number): TimesheetRow | undefined {
  return db.prepare(`${TIMESHEET_SELECT} WHERE t.id = ?`).get(id) as TimesheetRow | undefined;
}
