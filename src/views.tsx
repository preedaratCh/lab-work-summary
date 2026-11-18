import type { Child, FC } from 'hono/jsx';
import type { Settings, TemplateRow, TimesheetRow, WorkDay } from './db';
import type { GitDayData } from './git';
import { daysInMonth, hoursBetween, parseLocal, timeOf, weekdayOf } from './time';

// ---------- icons (inline SVG, stroke = currentColor) ----------

const PATHS: Record<string, string> = {
  play: 'M8 5.5v13l11-6.5z',
  stop: 'M7 7h10v10H7z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  sheet: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  git: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  folder: 'M3 6h6l2 2h10v11H3z',
  folders: 'M2 8h5l2 2h8v8H2zM7 5h5l2 2h8v8',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  back: 'M15 6l-6 6 6 6',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5',
};

export const Icon: FC<{ name: keyof typeof PATHS | string; class?: string }> = ({ name, class: cls }) => (
  <svg
    class={`icon ${cls ?? ''}`}
    viewBox="0 0 24 24"
    fill={name === 'play' || name === 'stop' ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d={PATHS[name]} />
  </svg>
);

// ---------- layout ----------

type NavKey = 'home' | 'timesheet' | 'settings' | 'day';

export const Layout: FC<{ title: string; msg?: string; active?: NavKey; children?: Child }> = ({ title, msg, active, children }) => (
  <html lang="th">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · WorkingLab</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
      />
      <link rel="stylesheet" href="/static/app.css" />
      <script src="/static/htmx.min.js" defer></script>
      <script src="/static/app.js" defer></script>
    </head>
    <body>
      <header class="top">
        <div class="top-inner">
          <a class="brand" href="/">
            <span class="brand-mark">
              <Icon name="clock" />
            </span>
            WorkingLab
          </a>
          <nav class="nav">
            <a href="/" class={active === 'home' || active === 'day' ? 'active' : ''}>
              <Icon name="home" />
              <span>หน้าหลัก</span>
            </a>
            <a href="/timesheet" class={active === 'timesheet' ? 'active' : ''}>
              <Icon name="sheet" />
              <span>Timesheet</span>
            </a>
            <a href="/settings" class={active === 'settings' ? 'active' : ''}>
              <Icon name="gear" />
              <span>ตั้งค่า</span>
            </a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      {msg && (
        <div class="toast" role="status">
          <Icon name="sparkle" />
          {msg}
        </div>
      )}
    </body>
  </html>
);

// ---------- helpers ----------

const thaiDate = (date: string, opts: Intl.DateTimeFormatOptions) => parseLocal(`${date} 00:00:00`).toLocaleDateString('th-TH', opts);
const isoLocal = (dt: string | null) => (dt ? dt.replace(' ', 'T') : undefined);

function elapsed(from: string | null, to: string | null): string {
  if (!from) return '0:00:00';
  const end = to ? parseLocal(to) : new Date();
  const ms = Math.max(0, end.getTime() - parseLocal(from).getTime());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${Math.floor(ms / 3_600_000)}:${p(Math.floor((ms % 3_600_000) / 60_000))}:${p(Math.floor((ms % 60_000) / 1000))}`;
}

function heatLevel(h: number | null): string {
  if (!h) return '';
  if (h < 4) return 'l1';
  if (h < 7) return 'l2';
  if (h < 9) return 'l3';
  return 'l4';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'ดึกแล้วนะ 🌙';
  if (h < 12) return 'สวัสดีตอนเช้า ☀️';
  if (h < 17) return 'สวัสดีตอนบ่าย 🌤️';
  return 'สวัสดีตอนเย็น 🌆';
}

const STATUS_TEXT: Record<WorkDay['summary_status'], string> = {
  none: 'ยังไม่สรุป',
  running: 'กำลังสรุป',
  done: 'สรุปแล้ว',
  error: 'สรุปไม่สำเร็จ',
};
const STATUS_CLASS: Record<WorkDay['summary_status'], string> = { none: 'muted', running: 'warn', done: 'ok', error: 'error' };

const StatusBadge: FC<{ status: WorkDay['summary_status'] }> = ({ status }) => (
  <span class={`badge ${STATUS_CLASS[status]}`}>{STATUS_TEXT[status]}</span>
);

const CardTitle: FC<{ icon: string; title: string; sub?: string }> = ({ icon, title, sub }) => (
  <div class="card-title">
    <span class="icon-bubble">
      <Icon name={icon} />
    </span>
    <div>
      <h2>{title}</h2>
      {sub && <div class="muted" style="font-size:.82rem">{sub}</div>}
    </div>
  </div>
);

// ---------- work detail ----------

/** กล่อง work detail; ถ้ากำลังสรุปอยู่ จะถาม server ซ้ำทุก 3 วินาทีจนเสร็จ */
export const SummaryBox: FC<{ day: WorkDay }> = ({ day }) => {
  const running = day.summary_status === 'running';
  const poll = running ? { 'hx-get': `/days/${day.work_date}/summary-box`, 'hx-trigger': 'every 3s', 'hx-swap': 'outerHTML' } : {};
  return (
    <div {...poll}>
      {running && (
        <>
          <div class="thinking">
            <span class="spinner"></span>
            <span>agent กำลังอ่าน git และสรุปงานให้… (ประมาณ 1-2 นาที)</span>
          </div>
          {!day.summary && (
            <div class="skeleton">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
          )}
        </>
      )}
      {day.summary_status === 'error' && (
        <div class="alert error">
          <Icon name="alert" class="error" />
          <div>
            <strong>สรุปไม่สำเร็จ</strong>
            <div>{day.summary_error}</div>
          </div>
        </div>
      )}
      {day.summary ? (
        <pre class="work-detail">{day.summary}</pre>
      ) : (
        !running && (
          <div class="empty">
            <Icon name="inbox" />
            <div>ยังไม่มี work detail</div>
          </div>
        )
      )}
    </div>
  );
};

// ---------- home ----------

export const HomePage: FC<{ today: string; day?: WorkDay; days: WorkDay[]; settingsReady: boolean; msg?: string }> = ({
  today,
  day,
  days,
  settingsReady,
  msg,
}) => {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const working = !!day?.check_in_at && !day.check_out_at;
  const done = !!day?.check_out_at;

  const worked = days.filter((d) => d.check_in_at);
  const totalHours = worked.reduce((sum, d) => sum + (hoursBetween(d.check_in_at, d.check_out_at) ?? 0), 0);
  const fullDays = worked.filter((d) => d.check_out_at).length;
  const avg = fullDays ? totalHours / fullDays : 0;

  return (
    <Layout title="หน้าหลัก" msg={msg} active="home">
      {!settingsReady && (
        <div class="alert info">
          <Icon name="folder" />
          <div>
            ยังไม่ได้ตั้งค่า folder target ตอนเลิกงานจะสรุปงานจาก git ไม่ได้ <a href="/settings">ตั้งค่าตอนนี้ →</a>
          </div>
        </div>
      )}

      <section class="card hero" data-checkin={isoLocal(day?.check_in_at ?? null)} data-checkout={isoLocal(day?.check_out_at ?? null)}>
        <div style="position:relative; z-index:1">
          <div class="greet">{greeting()}</div>
          <div class="today">{thaiDate(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div class="clock" id="clock">
            {p(now.getHours())}:{p(now.getMinutes())}
            <span>:{p(now.getSeconds())}</span>
          </div>
          <div class="chips">
            <div class="chip">
              <div class="label">
                <Icon name="play" /> เข้างาน
              </div>
              <div class="value">{timeOf(day?.check_in_at) || '--:--'}</div>
            </div>
            <div class="chip">
              <div class="label">
                <Icon name="stop" /> เลิกงาน
              </div>
              <div class="value">{timeOf(day?.check_out_at) || '--:--'}</div>
            </div>
            <div class={`chip ${working ? 'live' : ''}`}>
              <div class="label">
                {working ? <span class="dot"></span> : <Icon name="clock" />} {working ? 'กำลังทำงาน' : 'ทำงานไป'}
              </div>
              <div class="value" data-elapsed="">
                {elapsed(day?.check_in_at ?? null, day?.check_out_at ?? null)}
              </div>
            </div>
          </div>
        </div>

        <div class="orb-zone">
          <div class="orb-wrap">
            <svg class="ring" viewBox="0 0 220 220" aria-hidden="true">
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#6d4aff" />
                  <stop offset="100%" stop-color="#0ea5e9" />
                </linearGradient>
              </defs>
              <circle class="track" cx="110" cy="110" r="100" />
              <circle class="progress" cx="110" cy="110" r="100" />
            </svg>
            {!day?.check_in_at && (
              <form method="post" action="/check-in" class="orb-form">
                <button class="orb orb-in">
                  <Icon name="play" />
                  <span class="orb-label">เข้างาน</span>
                  <span class="orb-sub">เริ่มนับเวลา</span>
                </button>
              </form>
            )}
            {working && (
              <form method="post" action="/check-out" class="orb-form">
                <button class="orb orb-out">
                  <Icon name="stop" />
                  <span class="orb-label">เลิกงาน</span>
                  <span class="orb-sub">แล้วให้ agent สรุปงาน</span>
                </button>
              </form>
            )}
            {done && (
              <div class="orb orb-done">
                <Icon name="check" />
                <span class="orb-label">เสร็จแล้ว</span>
                <span class="orb-sub">{hoursBetween(day!.check_in_at, day!.check_out_at) ?? 0} ชม. วันนี้</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {done && day && (
        <section class="card">
          <div class="card-head">
            <CardTitle icon="sparkle" title="Work detail วันนี้" sub="สรุปจาก git โดย agent" />
            <a class="btn ghost" href={`/days/${today}`}>
              <Icon name="edit" /> ดู / แก้ไข
            </a>
          </div>
          <SummaryBox day={day} />
        </section>
      )}

      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <CardTitle icon="calendar" title={thaiDate(today, { month: 'long', year: 'numeric' })} sub="ภาพรวมเดือนนี้" />
          </div>
          <div class="stats">
            <div class="stat">
              <div class="value grad-text">{worked.length}</div>
              <div class="label">วันทำงาน</div>
            </div>
            <div class="stat">
              <div class="value">{Math.round(totalHours * 10) / 10}</div>
              <div class="label">ชั่วโมงรวม</div>
            </div>
            <div class="stat">
              <div class="value">{Math.round(avg * 10) / 10}</div>
              <div class="label">เฉลี่ย ชม./วัน</div>
            </div>
          </div>
          <Calendar today={today} days={days} />
        </section>

        <section class="card">
          <div class="card-head">
            <CardTitle icon="clock" title="บันทึกล่าสุด" />
            <form method="get" action="/day" class="row" style="gap:8px">
              <input type="date" name="date" required aria-label="เลือกวันที่" />
              <button class="btn">เปิด</button>
            </form>
          </div>
          {days.length ? (
            <div class="days">
              {days.slice(0, 8).map((d) => (
                <DayRow d={d} />
              ))}
            </div>
          ) : (
            <div class="empty">
              <Icon name="inbox" />
              <div>ยังไม่มีบันทึกในเดือนนี้ กด "เข้างาน" เพื่อเริ่ม</div>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
};

const Calendar: FC<{ today: string; days: WorkDay[] }> = ({ today, days }) => {
  const month = today.slice(0, 7);
  const byDate = new Map(days.map((d) => [d.work_date, d]));
  const offset = parseLocal(`${month}-01 00:00:00`).getDay();
  const cells: Child[] = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((w) => <div class="wd">{w}</div>);
  for (let i = 0; i < offset; i++) cells.push(<span></span>);
  for (let n = 1; n <= daysInMonth(month); n++) {
    const date = `${month}-${String(n).padStart(2, '0')}`;
    const d = byDate.get(date);
    const h = d ? hoursBetween(d.check_in_at, d.check_out_at) : null;
    const cls = [heatLevel(h), date === today ? 'is-today' : '', date > today ? 'future' : '', d?.summary_status === 'error' ? 'has-error' : '']
      .filter(Boolean)
      .join(' ');
    cells.push(
      date > today ? (
        <span class={`cell ${cls}`}>{n}</span>
      ) : (
        <a href={`/days/${date}`} class={cls} title={h ? `${date} · ${h} ชม.` : date}>
          {n}
        </a>
      ),
    );
  }
  return (
    <>
      <div class="cal">{cells}</div>
      <div class="legend">
        น้อย <i></i>
        <i class="l1"></i>
        <i class="l2"></i>
        <i class="l3"></i>
        <i class="l4"></i> มาก
      </div>
    </>
  );
};

const DayRow: FC<{ d: WorkDay }> = ({ d }) => {
  const h = hoursBetween(d.check_in_at, d.check_out_at);
  return (
    <a class="day-row" href={`/days/${d.work_date}`}>
      <div class="day-date">
        <div class="d">{Number(d.work_date.slice(8))}</div>
        <div class="w">{weekdayOf(d.work_date)}</div>
      </div>
      <div class="day-main">
        <div class="day-times">
          <span class="num">
            {timeOf(d.check_in_at) || '--:--'} → {timeOf(d.check_out_at) || '--:--'}
          </span>
          <StatusBadge status={d.summary_status} />
        </div>
        <div class="day-preview">{d.summary?.split('\n').find((l) => l.trim()) ?? <span class="muted">—</span>}</div>
      </div>
      <div class="day-hours">
        {h ?? '–'}
        <small>ชม.</small>
      </div>
    </a>
  );
};

// ---------- day ----------

export const DayPage: FC<{ date: string; day?: WorkDay; msg?: string }> = ({ date, day, msg }) => {
  const git = day?.git_data ? (JSON.parse(day.git_data) as GitDayData) : null;
  const running = day?.summary_status === 'running';
  const h = hoursBetween(day?.check_in_at ?? null, day?.check_out_at ?? null);
  const totalCommits = git?.repos.reduce((s, r) => s + r.commits.length, 0) ?? 0;
  const totalFiles = git?.repos.reduce((s, r) => s + r.uncommitted.files.length, 0) ?? 0;

  return (
    <Layout title={date} msg={msg} active="day">
      <div class="page-head">
        <div>
          <a href="/" class="muted row" style="gap:4px; margin-bottom:6px">
            <Icon name="back" /> กลับหน้าหลัก
          </a>
          <h1>{thaiDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h1>
        </div>
        {day && <StatusBadge status={day.summary_status} />}
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <CardTitle icon="clock" title="เวลาเข้า-เลิกงาน" sub="แก้ได้ถ้าลืมกดหรือกดผิดเวลา" />
          </div>
          <form method="post" action={`/days/${date}/times`} class="time-inputs">
            <label>
              เข้างาน
              <input type="time" name="check_in" value={timeOf(day?.check_in_at)} />
            </label>
            <label>
              เลิกงาน
              <input type="time" name="check_out" value={timeOf(day?.check_out_at)} />
            </label>
            <button class="btn">บันทึกเวลา</button>
          </form>
          <div class="stats" style="margin:20px 0 0">
            <div class="stat">
              <div class="value grad-text">{h ?? '–'}</div>
              <div class="label">ชั่วโมง</div>
            </div>
            <div class="stat">
              <div class="value">{git ? totalCommits : '–'}</div>
              <div class="label">commits</div>
            </div>
            <div class="stat">
              <div class="value">{git ? totalFiles : '–'}</div>
              <div class="label">ไฟล์ค้าง</div>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <CardTitle icon="git" title="ข้อมูล git" sub={git ? `เก็บเมื่อ ${git.collectedAt.slice(11, 16)}` : 'ยังไม่ได้เก็บ'} />
          </div>
          {git ? (
            <>
              {git.warnings.map((w) => (
                <div class="alert info">
                  <Icon name="alert" /> <div>{w}</div>
                </div>
              ))}
              <ul class="repo-list">
                {git.repos.map((r) => (
                  <li>
                    <Icon name="git" />
                    <strong style="flex:1">{r.name}</strong>
                    {r.error ? (
                      <span class="badge error">error</span>
                    ) : (
                      <span class="muted num" style="font-size:.85rem">
                        {r.commits.length} commits · {r.uncommitted.files.length} ไฟล์ค้าง
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <details style="margin-top:14px">
                <summary>ดูข้อมูลดิบ</summary>
                <pre class="raw">{JSON.stringify(git, null, 2)}</pre>
              </details>
            </>
          ) : (
            <div class="empty">
              <Icon name="git" />
              <div>ข้อมูลจะถูกเก็บตอนกดเลิกงาน หรือกด "เก็บ git ใหม่ + สรุป"</div>
            </div>
          )}
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <CardTitle icon="sparkle" title="Work detail" sub="ใช้ตอน gen timesheet สิ้นเดือน" />
          <div class="row" style="gap:8px">
            {git && (
              <form method="post" action={`/days/${date}/summarize`}>
                <button class="btn" disabled={running} title="ใช้กรณี agent สรุปไม่สำเร็จ เช่นโควตาหมด">
                  <Icon name="refresh" /> สรุปใหม่ (git เดิม)
                </button>
              </form>
            )}
            <form method="post" action={`/days/${date}/summarize`}>
              <input type="hidden" name="recollect" value="1" />
              <button class="btn primary" disabled={running}>
                <Icon name="sparkle" /> เก็บ git ใหม่ + สรุป
              </button>
            </form>
          </div>
        </div>
        <SummaryBox day={day ?? emptyDay(date)} />
        <details style="margin-top:18px">
          <summary>
            <Icon name="edit" /> แก้ไข work detail เอง
          </summary>
          <form method="post" action={`/days/${date}/summary`} style="margin-top:12px">
            <textarea name="summary">{day?.summary ?? ''}</textarea>
            <button class="btn" style="margin-top:10px">
              บันทึก work detail
            </button>
          </form>
        </details>
      </section>
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

// ---------- settings ----------

export const SettingsPage: FC<{ s: Settings; test?: { repos?: string[]; error?: string }; msg?: string }> = ({ s, test, msg }) => (
  <Layout title="ตั้งค่า" msg={msg} active="settings">
    <div class="page-head">
      <div>
        <div class="eyebrow">Settings</div>
        <h1>ตั้งค่า</h1>
      </div>
    </div>

    <form method="post" action="/settings">
      <section class="card">
        <div class="card-head">
          <CardTitle icon="folder" title="Folder target" sub="ที่ที่ระบบจะไปดูว่าวันนี้คุณแก้อะไรใน git" />
        </div>
        <label class="field">
          <span class="field-label">Path</span>
          <input type="text" name="targetPath" value={s.targetPath} placeholder="เช่น D:\projects" />
        </label>
        <div class="field">
          <span class="field-label">ประเภท</span>
          <div class="options">
            <label class="option">
              <input type="radio" name="targetType" value="single" checked={s.targetType === 'single'} />
              <span class="icon-bubble">
                <Icon name="folder" />
              </span>
              <span>
                <strong>Single repo</strong>
                <small>folder นี้คือ git repo เดียว</small>
              </span>
            </label>
            <label class="option">
              <input type="radio" name="targetType" value="multi" checked={s.targetType === 'multi'} />
              <span class="icon-bubble">
                <Icon name="folders" />
              </span>
              <span>
                <strong>Multi repo</strong>
                <small>ข้างในมีหลาย repo (สแกน folder ย่อยชั้นแรก)</small>
              </span>
            </label>
          </div>
        </div>
        <label class="field" style="margin-bottom:0">
          <span class="field-label">อีเมล git ของคุณ</span>
          <input type="text" name="authorEmails" value={s.authorEmails.join(', ')} placeholder="me@work.com, me@gmail.com" />
          <div class="hint">ใช้กรองว่า commit ไหนเป็นของคุณ ใส่ได้หลายอีเมลคั่นด้วย , (เว้นว่าง = ใช้ git config user.email ของแต่ละ repo)</div>
        </label>
      </section>

      <section class="card">
        <div class="card-head">
          <CardTitle icon="sparkle" title="Agent" sub="Claude Code CLI ที่ใช้สรุปงานและกรอก timesheet" />
        </div>
        <label class="field">
          <span class="field-label">ภาษาของ work detail / timesheet</span>
          <input type="text" name="language" value={s.language} placeholder="ไทย หรือ English" />
        </label>
        <label class="field" style="margin-bottom:0">
          <span class="field-label">คำสั่ง Claude Code CLI</span>
          <input type="text" name="claudeCommand" value={s.claudeCommand} />
          <div class="hint">ปกติคือ claude ถ้าเรียกไม่เจอ ให้ใส่ path เต็มของไฟล์ claude</div>
        </label>
      </section>

      <div class="row" style="margin-bottom:20px">
        <button class="btn primary">บันทึก</button>
        <button class="btn" name="test" value="1">
          <Icon name="refresh" /> บันทึก + ทดสอบหา repo
        </button>
      </div>
    </form>

    {test && (
      <section class="card">
        <div class="card-head">
          <CardTitle icon="git" title="ผลทดสอบ" />
          {test.repos && <span class={`badge ${test.repos.length ? 'ok' : 'warn'}`}>พบ {test.repos.length} repo</span>}
        </div>
        {test.error && (
          <div class="alert error">
            <Icon name="alert" class="error" /> <div>{test.error}</div>
          </div>
        )}
        {test.repos && test.repos.length > 0 && (
          <ul class="repo-list">
            {test.repos.map((r) => (
              <li>
                <Icon name="git" /> {r}
              </li>
            ))}
          </ul>
        )}
      </section>
    )}
  </Layout>
);

// ---------- timesheet ----------

const TS_STATUS: Record<TimesheetRow['status'], [string, string]> = {
  running: ['กำลังสร้าง', 'warn'],
  done: ['เสร็จแล้ว', 'ok'],
  error: ['ไม่สำเร็จ', 'error'],
};

export const TimesheetList: FC<{ rows: TimesheetRow[] }> = ({ rows }) => {
  const poll = rows.some((r) => r.status === 'running') ? { 'hx-get': '/timesheet/list', 'hx-trigger': 'every 3s', 'hx-swap': 'outerHTML' } : {};
  return (
    <div {...poll}>
      {rows.length ? (
        <div class="table-wrap">
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
                  <td class="num">
                    <strong>{r.month}</strong>
                  </td>
                  <td>{r.template_name}</td>
                  <td class="num muted">{r.created_at.slice(0, 16)}</td>
                  <td>
                    <span class={`badge ${TS_STATUS[r.status][1]}`}>{TS_STATUS[r.status][0]}</span>
                    {r.error && (
                      <div class="error" style="font-size:.82rem; margin-top:4px">
                        {r.error}
                      </div>
                    )}
                  </td>
                  <td style="text-align:right">
                    {r.status === 'done' && (
                      <a class="btn" href={`/timesheet/${r.id}/download`}>
                        <Icon name="download" /> ดาวน์โหลด
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div class="empty">
          <Icon name="sheet" />
          <div>ยังไม่เคยสร้าง timesheet</div>
        </div>
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
  <Layout title="Timesheet" msg={msg} active="timesheet">
    <div class="page-head">
      <div>
        <div class="eyebrow">Timesheet</div>
        <h1>สร้าง timesheet สิ้นเดือน</h1>
      </div>
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head">
          <CardTitle icon="file" title="1. ไฟล์ต้นแบบ" sub="รองรับ .xlsx" />
        </div>
        {template ? (
          <div class="file-pill">
            <Icon name="check" />
            <div>
              <strong>{template.original_name}</strong>
              <div class="muted" style="font-size:.8rem">
                อัปโหลด {template.uploaded_at.slice(0, 16)}
              </div>
            </div>
          </div>
        ) : (
          <p class="muted" style="margin-top:0">
            ยังไม่มีไฟล์ต้นแบบ
          </p>
        )}
        <form method="post" action="/timesheet/template" enctype="multipart/form-data" class="dropzone">
          <input type="file" name="file" accept=".xlsx" required />
          <button class="btn">
            <Icon name="upload" /> {template ? 'เปลี่ยนต้นแบบ' : 'อัปโหลด'}
          </button>
        </form>
      </section>

      <section class="card">
        <div class="card-head">
          <CardTitle icon="sparkle" title="2. Gen timesheet" sub="agent กรอก work detail ทั้งเดือนลงต้นแบบ" />
        </div>
        <form method="post" action="/timesheet/generate" class="row">
          <input type="month" name="month" value={month} required style="font-size:1.05rem" />
          <button class="btn primary" disabled={!template}>
            <Icon name="sparkle" /> Gen timesheet
          </button>
        </form>
        <p class="hint">อาจใช้เวลาหลายนาที ระหว่างนี้ใช้หน้าอื่นได้ตามปกติ</p>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <CardTitle icon="download" title="ที่สร้างไว้" />
      </div>
      <TimesheetList rows={rows} />
    </section>
  </Layout>
);
