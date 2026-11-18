import { serve } from '@hono/node-server';
import { Hono, type Context } from 'hono';
import type { JSX } from 'hono/jsx/jsx-runtime';
import fs from 'node:fs';
import path from 'node:path';
import {
  addTemplate,
  checkIn,
  checkOut,
  getDay,
  getSettings,
  getTimesheet,
  latestTemplate,
  listDays,
  listTimesheets,
  saveSettings,
  setSummaryText,
  setTimes,
  TEMPLATE_DIR,
  TIMESHEET_DIR,
  toLanguage,
  type Settings,
} from './db';
import { discoverRepos } from './git';
import { startSummary } from './summary';
import { DATE_RE, localDate, localDateTime, MONTH_RE, monthOf, TIME_RE } from './time';
import { startTimesheet, validateXlsx } from './timesheet';
import { DayPage, HomePage, SettingsPage, SummaryBox, TimesheetList, TimesheetPage } from './views';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = '127.0.0.1'; // รัน local เท่านั้น: ไม่เปิดให้เครื่องอื่นในเครือข่ายเข้า
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const app = new Hono();

async function page(c: Context, node: JSX.Element) {
  return c.html('<!doctype html>' + (await node));
}

async function fragment(c: Context, node: JSX.Element) {
  return c.html(String(await node));
}

/** redirect พร้อมข้อความแจ้งเตือนสั้น ๆ */
function back(c: Context, to: string, msg?: string) {
  return c.redirect(msg ? `${to}${to.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : to, 303);
}

function validDate(c: Context): string | null {
  const date = c.req.param('date') ?? '';
  return DATE_RE.test(date) ? date : null;
}

const STATIC_FILES: Record<string, [string, string]> = {
  'htmx.min.js': ['node_modules/htmx.org/dist/htmx.min.js', 'text/javascript'],
  'app.css': ['public/app.css', 'text/css'],
  'app.js': ['public/app.js', 'text/javascript'],
};

app.get('/static/:file', (c) => {
  const entry = STATIC_FILES[c.req.param('file')];
  if (!entry) return c.notFound();
  return c.body(fs.readFileSync(path.join(ROOT, entry[0])), 200, {
    'content-type': `${entry[1]}; charset=utf-8`,
    'cache-control': 'no-cache',
  });
});

// ---------- หน้าหลัก: เข้างาน / เลิกงาน ----------

app.get('/', (c) => {
  const today = localDate();
  const month = monthOf(today);
  return page(
    c,
    <HomePage
      today={today}
      day={getDay(today)}
      days={listDays(`${month}-01`, `${month}-31`)}
      settingsReady={!!getSettings().targetPath}
      msg={c.req.query('msg')}
    />,
  );
});

app.post('/check-in', (c) => {
  const ok = checkIn(localDate(), localDateTime());
  return back(c, '/', ok ? undefined : 'You already checked in today');
});

app.post('/check-out', (c) => {
  const today = localDate();
  if (!checkOut(today, localDateTime())) return back(c, '/', "You haven't checked in, or already checked out");
  startSummary(today, true);
  return back(c, '/');
});

app.get('/day', (c) => {
  const date = c.req.query('date') ?? '';
  return DATE_RE.test(date) ? c.redirect(`/days/${date}`, 303) : back(c, '/', 'Invalid date');
});

// ---------- รายวัน ----------

app.get('/days/:date', (c) => {
  const date = validDate(c);
  if (!date) return c.notFound();
  return page(c, <DayPage date={date} day={getDay(date)} msg={c.req.query('msg')} />);
});

app.get('/days/:date/summary-box', (c) => {
  const date = validDate(c);
  const day = date && getDay(date);
  if (!day) return c.notFound();
  return fragment(c, <SummaryBox day={day} />);
});

app.post('/days/:date/times', async (c) => {
  const date = validDate(c);
  if (!date) return c.notFound();
  const body = await c.req.parseBody();
  const toDateTime = (v: unknown): string | null | false => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    return TIME_RE.test(s) ? `${date} ${s}:00` : false;
  };
  const inAt = toDateTime(body.check_in);
  const outAt = toDateTime(body.check_out);
  if (inAt === false || outAt === false) return back(c, `/days/${date}`, 'Invalid time format');
  if (outAt && !inAt) return back(c, `/days/${date}`, 'Add a check-in time before the check-out time');
  if (inAt && outAt && outAt <= inAt) return back(c, `/days/${date}`, 'Check-out must be after check-in');
  setTimes(date, inAt, outAt);
  return back(c, `/days/${date}`, 'Hours saved');
});

app.post('/days/:date/summary', async (c) => {
  const date = validDate(c);
  if (!date) return c.notFound();
  const body = await c.req.parseBody();
  setSummaryText(date, String(body.summary ?? '').trim());
  return back(c, `/days/${date}`, 'Work detail saved');
});

app.post('/days/:date/summarize', async (c) => {
  const date = validDate(c);
  if (!date) return c.notFound();
  const body = await c.req.parseBody();
  const started = startSummary(date, body.recollect === '1');
  return back(c, `/days/${date}`, started ? undefined : 'A summary is already running');
});

// ---------- ตั้งค่า ----------

app.get('/settings', async (c) => {
  const s = getSettings();
  let test: { repos?: string[]; error?: string } | undefined;
  if (c.req.query('test')) {
    try {
      test = { repos: await discoverRepos(s) };
    } catch (e) {
      test = { error: (e as Error).message };
    }
  }
  return page(c, <SettingsPage s={s} test={test} msg={c.req.query('msg')} />);
});

app.post('/settings', async (c) => {
  const body = await c.req.parseBody();
  const s: Settings = {
    targetPath: String(body.targetPath ?? '').trim(),
    targetType: body.targetType === 'single' ? 'single' : 'multi',
    authorEmails: String(body.authorEmails ?? '')
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean),
    language: toLanguage(body.language),
    claudeCommand: String(body.claudeCommand ?? '').trim() || 'claude',
  };
  saveSettings(s);
  return back(c, body.test ? '/settings?test=1' : '/settings', 'Settings saved');
});

// ---------- Timesheet ----------

app.get('/timesheet', (c) =>
  page(
    c,
    <TimesheetPage template={latestTemplate()} month={monthOf(localDate())} rows={listTimesheets()} msg={c.req.query('msg')} />,
  ),
);

app.get('/timesheet/list', (c) => fragment(c, <TimesheetList rows={listTimesheets()} />));

app.post('/timesheet/template', async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File) || !file.size) return back(c, '/timesheet', 'Please choose a file');
  if (!file.name.toLowerCase().endsWith('.xlsx')) return back(c, '/timesheet', 'Only .xlsx files are supported');
  if (file.size > MAX_UPLOAD_BYTES) return back(c, '/timesheet', 'File is larger than 10 MB');

  const storedName = `template-${Date.now()}.xlsx`;
  const dest = path.join(TEMPLATE_DIR, storedName);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  try {
    await validateXlsx(dest);
  } catch (e) {
    fs.rmSync(dest, { force: true });
    return back(c, '/timesheet', `Couldn't open the file: ${(e as Error).message}`);
  }
  addTemplate(path.basename(file.name), storedName);
  return back(c, '/timesheet', 'Template uploaded');
});

app.post('/timesheet/generate', async (c) => {
  const body = await c.req.parseBody();
  const month = String(body.month ?? '');
  if (!MONTH_RE.test(month)) return back(c, '/timesheet', 'Invalid month');
  const template = latestTemplate();
  if (!template) return back(c, '/timesheet', 'Upload a template first');
  startTimesheet(month, template);
  return back(c, '/timesheet');
});

app.get('/timesheet/:id/download', (c) => {
  const row = getTimesheet(Number(c.req.param('id')));
  if (!row?.output_name) return c.notFound();
  const file = path.join(TIMESHEET_DIR, row.output_name);
  if (!fs.existsSync(file)) return c.notFound();
  return c.body(fs.readFileSync(file), 200, {
    'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition': `attachment; filename="${row.output_name}"`,
  });
});

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`WorkingLab: http://${HOST}:${info.port}`);
});
