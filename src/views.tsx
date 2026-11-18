import type { Child, FC } from 'hono/jsx';
import type { Settings, TemplateRow, TimesheetRow, WorkDay } from './db';
import type { GitDayData } from './git';
import { hoursBetween, timeOf, weekdayOf } from './time';

const CSS = `
:root { --bg:#f6f7f9; --card:#fff; --text:#1d2330; --muted:#6b7280; --line:#e3e6eb; --accent:#2563eb;
  --ok:#15803d; --warn:#b45309; --err:#b91c1c; }
@media (prefers-color-scheme: dark) { :root { --bg:#14171c; --card:#1c2027; --text:#e6e8eb; --muted:#9aa3ae;
  --line:#2c323b; --accent:#60a5fa; --ok:#4ade80; --warn:#fbbf24; --err:#f87171; } }
* { box-sizing: border-box; }
body { margin:0; font-family: system-ui, "Segoe UI", "Noto Sans Thai", sans-serif; background:var(--bg); color:var(--text); line-height:1.5; }
a { color:var(--accent); }
header { background:var(--card); border-bottom:1px solid var(--line); }
nav { max-width:960px; margin:0 auto; padding:12px 16px; display:flex; gap:20px; align-items:center; }
nav strong { margin-right:auto; }
nav a { color:var(--text); text-decoration:none; }
nav a:hover { color:var(--accent); }
main { max-width:960px; margin:0 auto; padding:20px 16px 48px; }
h1 { font-size:1.4rem; margin:0 0 16px; }
h2 { font-size:1.1rem; margin:0 0 12px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:18px; margin-bottom:16px; }
.row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
.big { font-size:2rem; font-weight:600; font-variant-numeric: tabular-nums; }
.label { color:var(--muted); font-size:.85rem; }
.stat { min-width:120px; }
button, .btn { font:inherit; border:1px solid var(--line); background:var(--card); color:var(--text); padding:8px 14px; border-radius:8px; cursor:pointer; text-decoration:none; display:inline-block; }
button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
button.big-btn { font-size:1.15rem; padding:12px 28px; }
button:hover, .btn:hover { filter:brightness(.97); }
input, select, textarea { font:inherit; color:var(--text); background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
textarea { width:100%; min-height:220px; }
label.field { display:block; margin-bottom:14px; }
label.field > span { display:block; font-weight:500; margin-bottom:4px; }
label.field input[type=text] { width:100%; }
.hint { color:var(--muted); font-size:.85rem; margin-top:4px; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--muted); font-weight:500; font-size:.85rem; }
td.num { font-variant-numeric: tabular-nums; white-space:nowrap; }
.preview { color:var(--muted); max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
pre { white-space:pre-wrap; word-break:break-word; margin:0; font-family:inherit; }
pre.raw { font-family: ui-monospace, Consolas, monospace; font-size:.8rem; max-height:480px; overflow:auto; background:var(--bg); padding:10px; border-radius:8px; }
.muted { color:var(--muted); }
.ok { color:var(--ok); } .warn { color:var(--warn); } .error { color:var(--err); }
.flash { background:var(--card); border:1px solid var(--line); border-left:4px solid var(--accent); padding:10px 14px; border-radius:8px; }
.badge { font-size:.8rem; padding:2px 8px; border-radius:999px; border:1px solid var(--line); white-space:nowrap; }
details summary { cursor:pointer; color:var(--muted); }
`;

export const Layout: FC<{ title: string; msg?: string; children?: Child }> = ({ title, msg, children }) => (
  <html lang="th">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · WorkingLab</title>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script src="/static/htmx.min.js" defer></script>
    </head>
    <body>
      <header>
        <nav>
          <strong>WorkingLab</strong>
          <a href="/">หน้าหลัก</a>
          <a href="/timesheet">Timesheet</a>
          <a href="/settings">ตั้งค่า</a>
        </nav>
      </header>
      <main>
        {msg && <p class="flash">{msg}</p>}
        {children}
      </main>
    </body>
  </html>
);

const STATUS_TEXT: Record<WorkDay['summary_status'], string> = {
  none: 'ยังไม่สรุป',
  running: 'กำลังสรุป…',
  done: 'สรุปแล้ว',
  error: 'สรุปไม่สำเร็จ',
};
const STATUS_CLASS: Record<WorkDay['summary_status'], string> = { none: 'muted', running: 'warn', done: 'ok', error: 'error' };

const StatusBadge: FC<{ status: WorkDay['summary_status'] }> = ({ status }) => (
  <span class={`badge ${STATUS_CLASS[status]}`}>{STATUS_TEXT[status]}</span>
);

/** กล่อง work detail; ถ้ากำลังสรุปอยู่ จะถาม server ซ้ำทุก 3 วินาทีจนเสร็จ */
export const SummaryBox: FC<{ day: WorkDay }> = ({ day }) => {
  const poll =
    day.summary_status === 'running'
      ? { 'hx-get': `/days/${day.work_date}/summary-box`, 'hx-trigger': 'every 3s', 'hx-swap': 'outerHTML' }
      : {};
  return (
    <div {...poll}>
      {day.summary_status === 'running' && <p class="warn">⏳ กำลังเก็บข้อมูล git และให้ agent สรุปงาน (อาจใช้เวลา 1-2 นาที)…</p>}
      {day.summary_status === 'error' && <p class="error">สรุปไม่สำเร็จ: {day.summary_error}</p>}
      {day.summary ? <pre>{day.summary}</pre> : day.summary_status !== 'running' && <p class="muted">ยังไม่มี work detail</p>}
    </div>
  );
};

export const HomePage: FC<{ today: string; day?: WorkDay; days: WorkDay[]; settingsReady: boolean; msg?: string }> = ({
  today,
  day,
  days,
  settingsReady,
  msg,
}) => {
  const hours = hoursBetween(day?.check_in_at ?? null, day?.check_out_at ?? null);
  return (
    <Layout title="หน้าหลัก" msg={msg}>
      {!settingsReady && (
        <p class="flash">
          ยังไม่ได้ตั้งค่า folder target ตอนเลิกงานจะสรุปงานจาก git ไม่ได้ <a href="/settings">ไปตั้งค่า</a>
        </p>
      )}
      <section class="card">
        <h1>
          วันนี้ {today} ({weekdayOf(today)})
        </h1>
        <div class="row" style="gap:32px; margin-bottom:16px">
          <div class="stat">
            <div class="label">เข้างาน</div>
            <div class="big">{timeOf(day?.check_in_at) || '--:--'}</div>
          </div>
          <div class="stat">
            <div class="label">เลิกงาน</div>
            <div class="big">{timeOf(day?.check_out_at) || '--:--'}</div>
          </div>
          {hours !== null && (
            <div class="stat">
              <div class="label">รวม</div>
              <div class="big">{hours} ชม.</div>
            </div>
          )}
        </div>
        <div class="row">
          {!day?.check_in_at && (
            <form method="post" action="/check-in">
              <button class="primary big-btn">เข้างาน</button>
            </form>
          )}
          {day?.check_in_at && !day.check_out_at && (
            <form method="post" action="/check-out">
              <button class="primary big-btn">เลิกงาน</button>
            </form>
          )}
          {day && (
            <a class="btn" href={`/days/${today}`}>
              ดู / แก้ไขวันนี้
            </a>
          )}
        </div>
      </section>

      {day?.check_out_at && (
        <section class="card">
          <h2>Work detail วันนี้</h2>
          <SummaryBox day={day} />
        </section>
      )}

      <section class="card">
        <div class="row" style="justify-content:space-between; margin-bottom:8px">
          <h2 style="margin:0">เดือนนี้</h2>
          <form method="get" action="/day" class="row">
            <input type="date" name="date" required />
            <button>เปิดวันอื่น</button>
          </form>
        </div>
        {days.length ? <DayTable days={days} /> : <p class="muted">ยังไม่มีบันทึกในเดือนนี้</p>}
      </section>
    </Layout>
  );
};

const DayTable: FC<{ days: WorkDay[] }> = ({ days }) => (
  <table>
    <thead>
      <tr>
        <th>วันที่</th>
        <th>เข้า</th>
        <th>เลิก</th>
        <th>ชม.</th>
        <th>Work detail</th>
      </tr>
    </thead>
    <tbody>
      {days.map((d) => (
        <tr>
          <td class="num">
            <a href={`/days/${d.work_date}`}>{d.work_date}</a> <span class="muted">{weekdayOf(d.work_date)}</span>
          </td>
          <td class="num">{timeOf(d.check_in_at) || '-'}</td>
          <td class="num">{timeOf(d.check_out_at) || '-'}</td>
          <td class="num">{hoursBetween(d.check_in_at, d.check_out_at) ?? '-'}</td>
          <td>
            <StatusBadge status={d.summary_status} /> <span class="preview">{d.summary?.split('\n')[0] ?? ''}</span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const DayPage: FC<{ date: string; day?: WorkDay; msg?: string }> = ({ date, day, msg }) => {
  const git = day?.git_data ? (JSON.parse(day.git_data) as GitDayData) : null;
  const running = day?.summary_status === 'running';
  return (
    <Layout title={date} msg={msg}>
      <h1>
        {date} ({weekdayOf(date)})
      </h1>

      <section class="card">
        <h2>เวลาเข้า-เลิกงาน</h2>
        <form method="post" action={`/days/${date}/times`} class="row">
          <label>
            เข้างาน <input type="time" name="check_in" value={timeOf(day?.check_in_at)} />
          </label>
          <label>
            เลิกงาน <input type="time" name="check_out" value={timeOf(day?.check_out_at)} />
          </label>
          <button>บันทึกเวลา</button>
        </form>
        <p class="hint">ใช้แก้กรณีลืมกด หรือกดผิดเวลา (เว้นว่าง = ไม่มีเวลา)</p>
      </section>

      <section class="card">
        <h2>Work detail</h2>
        <SummaryBox day={day ?? emptyDay(date)} />
        <div class="row" style="margin-top:14px">
          <form method="post" action={`/days/${date}/summarize`}>
            <input type="hidden" name="recollect" value="1" />
            <button class="primary" disabled={running}>
              เก็บข้อมูล git ใหม่ + สรุป
            </button>
          </form>
          {git && (
            <form method="post" action={`/days/${date}/summarize`}>
              <button disabled={running}>สรุปใหม่จากข้อมูล git เดิม</button>
            </form>
          )}
        </div>
        <p class="hint">
          ข้อมูล git เดิม = ที่เก็บไว้ตอนกดเลิกงาน{git ? ` (${git.collectedAt})` : ''} ใช้กรณี agent สรุปไม่สำเร็จ เช่นโควตาหมด
        </p>
        <details style="margin-top:14px">
          <summary>แก้ไข work detail เอง</summary>
          <form method="post" action={`/days/${date}/summary`} style="margin-top:10px">
            <textarea name="summary">{day?.summary ?? ''}</textarea>
            <button style="margin-top:8px">บันทึก work detail</button>
          </form>
        </details>
      </section>

      {git && (
        <section class="card">
          <h2>ข้อมูล git ที่เก็บได้</h2>
          {git.warnings.map((w) => (
            <p class="warn">{w}</p>
          ))}
          <table>
            <thead>
              <tr>
                <th>Repo</th>
                <th>Commits</th>
                <th>ไฟล์ที่ยังไม่ commit</th>
              </tr>
            </thead>
            <tbody>
              {git.repos.map((r) => (
                <tr>
                  <td>
                    {r.name}
                    {r.error && <div class="error">{r.error}</div>}
                  </td>
                  <td class="num">{r.commits.length}</td>
                  <td class="num">{r.uncommitted.files.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details style="margin-top:10px">
            <summary>ดูข้อมูลดิบ</summary>
            <pre class="raw">{JSON.stringify(git, null, 2)}</pre>
          </details>
        </section>
      )}
    </Layout>
  );
};

function emptyDay(date: string): WorkDay {
  return {
    work_date: date,
    check_in_at: null,
    check_out_at: null,
    git_data: null,
    summary: null,
    summary_status: 'none',
    summary_error: null,
    updated_at: '',
  };
}

export const SettingsPage: FC<{ s: Settings; test?: { repos?: string[]; error?: string }; msg?: string }> = ({ s, test, msg }) => (
  <Layout title="ตั้งค่า" msg={msg}>
    <h1>ตั้งค่า</h1>
    <form method="post" action="/settings" class="card">
      <label class="field">
        <span>Folder target</span>
        <input type="text" name="targetPath" value={s.targetPath} placeholder="เช่น D:\projects" />
      </label>
      <label class="field">
        <span>ประเภท folder target</span>
        <select name="targetType">
          <option value="single" selected={s.targetType === 'single'}>
            single: folder นี้เป็น git repo เดียว
          </option>
          <option value="multi" selected={s.targetType === 'multi'}>
            multi: ข้างในมีหลาย repo (สแกน folder ย่อยชั้นแรก)
          </option>
        </select>
      </label>
      <label class="field">
        <span>อีเมล git ของคุณ</span>
        <input type="text" name="authorEmails" value={s.authorEmails.join(', ')} placeholder="me@work.com, me@gmail.com" />
        <div class="hint">ใช้กรองว่า commit ไหนเป็นของคุณ ใส่ได้หลายอีเมลคั่นด้วย , (เว้นว่าง = ใช้ git config user.email ของแต่ละ repo)</div>
      </label>
      <label class="field">
        <span>ภาษาของ work detail / timesheet</span>
        <input type="text" name="language" value={s.language} placeholder="ไทย หรือ English" />
      </label>
      <label class="field">
        <span>คำสั่ง Claude Code CLI</span>
        <input type="text" name="claudeCommand" value={s.claudeCommand} />
        <div class="hint">ปกติคือ claude ถ้าเรียกไม่เจอ ให้ใส่ path เต็มของไฟล์ claude</div>
      </label>
      <div class="row">
        <button class="primary">บันทึก</button>
        <button name="test" value="1">บันทึก + ทดสอบหา repo</button>
      </div>
    </form>

    {test && (
      <section class="card">
        <h2>ผลทดสอบ</h2>
        {test.error && <p class="error">{test.error}</p>}
        {test.repos &&
          (test.repos.length ? (
            <>
              <p class="ok">พบ {test.repos.length} repo</p>
              <ul>
                {test.repos.map((r) => (
                  <li>{r}</li>
                ))}
              </ul>
            </>
          ) : (
            <p class="warn">ไม่พบ git repo</p>
          ))}
      </section>
    )}
  </Layout>
);

const TS_STATUS: Record<TimesheetRow['status'], [string, string]> = {
  running: ['กำลังสร้าง…', 'warn'],
  done: ['เสร็จแล้ว', 'ok'],
  error: ['ไม่สำเร็จ', 'error'],
};

export const TimesheetList: FC<{ rows: TimesheetRow[] }> = ({ rows }) => {
  const poll = rows.some((r) => r.status === 'running')
    ? { 'hx-get': '/timesheet/list', 'hx-trigger': 'every 3s', 'hx-swap': 'outerHTML' }
    : {};
  return (
    <div {...poll}>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              <th>เดือน</th>
              <th>ต้นแบบ</th>
              <th>สร้างเมื่อ</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td class="num">{r.month}</td>
                <td>{r.template_name}</td>
                <td class="num">{r.created_at.slice(0, 16)}</td>
                <td>
                  <span class={`badge ${TS_STATUS[r.status][1]}`}>{TS_STATUS[r.status][0]}</span>
                  {r.error && <div class="error">{r.error}</div>}
                </td>
                <td>{r.status === 'done' && <a href={`/timesheet/${r.id}/download`}>ดาวน์โหลด</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="muted">ยังไม่เคยสร้าง timesheet</p>
      )}
    </div>
  );
};

export const TimesheetPage: FC<{ template?: TemplateRow; month: string; rows: TimesheetRow[]; msg?: string }> = ({
  template,
  month,
  rows,
  msg,
}) => (
  <Layout title="Timesheet" msg={msg}>
    <h1>Timesheet</h1>
    <section class="card">
      <h2>ไฟล์ต้นแบบ (.xlsx)</h2>
      {template ? (
        <p>
          ใช้อยู่: <strong>{template.original_name}</strong> <span class="muted">(อัปโหลด {template.uploaded_at.slice(0, 16)})</span>
        </p>
      ) : (
        <p class="muted">ยังไม่มีไฟล์ต้นแบบ</p>
      )}
      <form method="post" action="/timesheet/template" enctype="multipart/form-data" class="row">
        <input type="file" name="file" accept=".xlsx" required />
        <button>{template ? 'อัปโหลดต้นแบบใหม่' : 'อัปโหลด'}</button>
      </form>
    </section>

    <section class="card">
      <h2>สร้าง timesheet</h2>
      <form method="post" action="/timesheet/generate" class="row">
        <input type="month" name="month" value={month} required />
        <button class="primary" disabled={!template}>
          Gen timesheet
        </button>
      </form>
      <p class="hint">agent จะอ่านโครงสร้างไฟล์ต้นแบบ แล้วกรอก work detail ทั้งเดือนลงไป (อาจใช้เวลาหลายนาที)</p>
    </section>

    <section class="card">
      <h2>ที่สร้างไว้</h2>
      <TimesheetList rows={rows} />
    </section>
  </Layout>
);
