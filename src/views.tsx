import type { Child, FC } from 'hono/jsx';
import {
  AGENT_PROVIDER_META,
  AGENT_PROVIDERS,
  LANGUAGES,
  type Settings,
  type TemplateRow,
  type TimesheetRow,
  type WorkDay,
} from './db';
import type { GitDayData } from './git';
import { daysInMonth, hoursBetween, parseLocal, shiftMonth, timeOf, weekdayOf } from './time';

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
  next: 'M9 6l6 6-6 6',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5',
  inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
};

export const Icon: FC<{ name: string; class?: string }> = ({ name, class: cls }) => (
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

// set the saved theme before first paint so the page never flashes the wrong theme
const THEME_BOOT = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export const Layout: FC<{ title: string; msg?: string; active?: NavKey; children?: Child }> = ({ title, msg, active, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · WorkingLab</title>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400;500&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap"
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
              <Icon name="bolt" />
            </span>
            <span class="brand-text">WorkingLab</span>
          </a>
          <nav class="seg nav" aria-label="Main">
            <a href="/" class={active === 'home' || active === 'day' ? 'active' : ''}>
              <Icon name="home" />
              <span>Today</span>
            </a>
            <a href="/timesheet" class={active === 'timesheet' ? 'active' : ''}>
              <Icon name="sheet" />
              <span>Timesheet</span>
            </a>
            <a href="/settings" class={active === 'settings' ? 'active' : ''}>
              <Icon name="gear" />
              <span>Settings</span>
            </a>
          </nav>
          <div class="seg theme" role="group" aria-label="Theme">
            <button type="button" data-theme-set="light" title="Light">
              <Icon name="sun" />
            </button>
            <button type="button" data-theme-set="dark" title="Dark">
              <Icon name="moon" />
            </button>
            <button type="button" data-theme-set="system" title="Match system">
              <Icon name="monitor" />
            </button>
          </div>
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

const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions) => parseLocal(`${date} 00:00:00`).toLocaleDateString('en-GB', opts);
const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
const isoLocal = (dt: string | null | undefined) => (dt ? dt.replace(' ', 'T') : undefined);
const pad = (n: number) => String(n).padStart(2, '0');
const hourOf = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
const round1 = (n: number) => Math.round(n * 10) / 10;

function elapsed(from: string | null | undefined, to: string | null | undefined): string {
  if (!from) return '0:00:00';
  const end = to ? parseLocal(to) : new Date();
  const ms = Math.max(0, end.getTime() - parseLocal(from).getTime());
  return `${Math.floor(ms / 3_600_000)}:${pad(Math.floor((ms % 3_600_000) / 60_000))}:${pad(Math.floor((ms % 60_000) / 1000))}`;
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
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const STATUS_TEXT: Record<WorkDay['summary_status'], string> = {
  none: 'Not summarized',
  running: 'Summarizing',
  done: 'Summarized',
  error: 'Failed',
};
const STATUS_CLASS: Record<WorkDay['summary_status'], string> = { none: 'muted', running: 'warn', done: 'ok', error: 'error' };

const StatusBadge: FC<{ status: WorkDay['summary_status'] }> = ({ status }) => (
  <span class={`badge ${STATUS_CLASS[status]}`}>{STATUS_TEXT[status]}</span>
);

const CardTitle: FC<{ icon: string; title: Child; sub?: string }> = ({ icon, title, sub }) => (
  <div class="card-title">
    <span class="icon-bubble">
      <Icon name={icon} />
    </span>
    <div>
      <h2>{title}</h2>
      {sub && <div class="card-sub">{sub}</div>}
    </div>
  </div>
);

const Empty: FC<{ icon: string; children?: Child }> = ({ icon, children }) => (
  <div class="empty">
    <div class="empty-icon">
      <Icon name={icon} />
    </div>
    {children}
  </div>
);

// ---------- work detail ----------

/** Work detail box; while summarizing it re-fetches itself every 3s until done */
export const SummaryBox: FC<{ day: WorkDay }> = ({ day }) => {
  const running = day.summary_status === 'running';
  const poll = running ? { 'hx-get': `/days/${day.work_date}/summary-box`, 'hx-trigger': 'every 3s', 'hx-swap': 'outerHTML' } : {};
  return (
    <div {...poll}>
      {running && (
        <>
          <div class="thinking">
            <span class="spinner"></span>
            <span>The agent is reading your git history and writing the summary… (about 1–2 min)</span>
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
          <Icon name="alert" />
          <div>
            <strong>Summary failed</strong>
            <div>{day.summary_error}</div>
          </div>
        </div>
      )}
      {day.summary ? (
        <pre class="work-detail">{day.summary}</pre>
      ) : (
        !running && <Empty icon="inbox">No work detail yet</Empty>
      )}
    </div>
  );
};

// ---------- home ----------

/** Progress ring with 60 watch-style ticks */
const Ring: FC = () => {
  const ticks: Child[] = [];
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i / 60) * Math.PI * 2;
    const r1 = major ? 101 : 103;
    const r2 = 108;
    ticks.push(
      <line
        class={major ? 'tick major' : 'tick'}
        x1={(110 + r1 * Math.sin(a)).toFixed(2)}
        y1={(110 - r1 * Math.cos(a)).toFixed(2)}
        x2={(110 + r2 * Math.sin(a)).toFixed(2)}
        y2={(110 - r2 * Math.cos(a)).toFixed(2)}
      />,
    );
  }
  return (
    <svg class="ring" viewBox="0 0 220 220" aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#6d5cff" />
          <stop offset="55%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#06b6d4" />
        </linearGradient>
      </defs>
      {ticks}
      <circle class="track" cx="110" cy="110" r="92" />
      <circle class="progress" cx="110" cy="110" r="92" />
    </svg>
  );
};

/** Horizontal bar of today's working hours with a "now" marker */
const Timeline: FC<{ day?: WorkDay }> = ({ day }) => {
  const now = new Date();
  const start = day?.check_in_at ? parseLocal(day.check_in_at) : null;
  const end = day?.check_out_at ? parseLocal(day.check_out_at) : now;
  const from = Math.max(0, Math.min(7, start ? Math.floor(hourOf(start)) : 7));
  let to = Math.min(24, Math.max(19, Math.ceil(hourOf(end)) + 1, Math.ceil(hourOf(now)) + 1));
  const step = to - from > 12 ? 3 : 2;
  to = Math.min(24, from + Math.ceil((to - from) / step) * step);
  const labels: string[] = [];
  for (let h = from; h <= to; h += step) labels.push(`${pad(h % 24)}:00`);
  const pct = (d: Date) => Math.max(0, Math.min(100, ((hourOf(d) - from) / (to - from)) * 100));

  return (
    <div class="timeline" data-from={from} data-to={to}>
      <div class="tl-track">
        {start && (
          <div
            class={`tl-fill ${day?.check_out_at ? 'done' : ''}`}
            style={`left:${pct(start)}%; width:${Math.max(0.8, pct(end) - pct(start))}%`}
          ></div>
        )}
        {!day?.check_out_at && <div class="tl-now" style={`left:${pct(now)}%`}></div>}
      </div>
      <div class="tl-labels">
        {labels.map((l) => (
          <span>{l}</span>
        ))}
      </div>
    </div>
  );
};

export const HomePage: FC<{ today: string; month: string; day?: WorkDay; days: WorkDay[]; settingsReady: boolean; msg?: string }> = ({
  today,
  month,
  day,
  days,
  settingsReady,
  msg,
}) => {
  const now = new Date();
  const working = !!day?.check_in_at && !day.check_out_at;
  const done = !!day?.check_out_at;
  const isCurrent = month === today.slice(0, 7);
  const monthLabel = fmtDate(`${month}-01`, { month: 'long', year: 'numeric' });

  // วันทำงาน = มีเวลาเข้างาน หรือมี work detail (เช่นวันที่ backfill ย้อนหลังซึ่งไม่มีเวลา)
  const worked = days.filter((d) => d.check_in_at || (d.summary && d.summary_status === 'done'));
  const totalHours = worked.reduce((sum, d) => sum + (hoursBetween(d.check_in_at, d.check_out_at) ?? 0), 0);
  const fullDays = worked.filter((d) => d.check_out_at).length;
  const avg = fullDays ? totalHours / fullDays : 0;

  return (
    <Layout title="Today" msg={msg} active="home">
      {!settingsReady && (
        <div class="alert info banner">
          <Icon name="folder" />
          <div>
            No target folder set yet, so check-out can't summarize your git work. <a href="/settings">Set it up →</a>
          </div>
        </div>
      )}

      <div class="stack">
        <section
          class={`card hero ${working ? 'is-working' : ''}`}
          data-checkin={isoLocal(day?.check_in_at)}
          data-checkout={isoLocal(day?.check_out_at)}
        >
          <div>
            <span class={`status-pill ${working ? 'working' : done ? 'done' : ''}`}>
              <span class="dot"></span>
              {working ? 'Working now' : done ? 'Done for today' : 'Not checked in'}
            </span>
            <div class="hero-date">
              <span class="greet">{greeting()} · </span>
              {fmtDate(today, LONG_DATE)}
            </div>
            <div class="clock" id="clock">
              {pad(now.getHours())}:{pad(now.getMinutes())}
              <span class="sec">{pad(now.getSeconds())}</span>
            </div>
            <div class="metrics">
              <div class="metric">
                <div class="label">
                  <Icon name="play" /> In
                </div>
                <div class="value">{timeOf(day?.check_in_at) || '--:--'}</div>
              </div>
              <div class="metric">
                <div class="label">
                  <Icon name="stop" /> Out
                </div>
                <div class="value">{timeOf(day?.check_out_at) || '--:--'}</div>
              </div>
              <div class={`metric ${working ? 'live' : ''}`}>
                <div class="label">
                  <Icon name="clock" /> Worked
                </div>
                <div class="value" data-elapsed="">
                  {elapsed(day?.check_in_at, day?.check_out_at)}
                </div>
              </div>
            </div>
            <Timeline day={day} />
          </div>

          <div class="orb-zone">
            <div class="orb-wrap">
              <Ring />
              {!day?.check_in_at && (
                <form method="post" action="/check-in" class="orb-form">
                  <span class="orb-halo in"></span>
                  <button class="orb orb-in">
                    <Icon name="play" />
                    <span class="orb-label">Check in</span>
                    <span class="orb-sub">Start the clock</span>
                  </button>
                </form>
              )}
              {working && (
                <form method="post" action="/check-out" class="orb-form">
                  <span class="orb-halo out" style="--c: rgba(244,63,94,.4)"></span>
                  <button class="orb orb-out">
                    <Icon name="stop" />
                    <span class="orb-label">Check out</span>
                    <span class="orb-sub">& summarize my day</span>
                  </button>
                </form>
              )}
              {done && (
                <div class="orb orb-done">
                  <Icon name="check" />
                  <span class="orb-label">{round1(hoursBetween(day!.check_in_at, day!.check_out_at) ?? 0)}h</span>
                  <span class="orb-sub">Nice work today</span>
                </div>
              )}
              <span class="ring-caption">Ring fills at 8 hours</span>
            </div>
          </div>
        </section>

        {done && day && (
          <section class="card">
            <div class="card-head">
              <CardTitle icon="sparkle" title="Today's work detail" sub="Summarized from git by the agent" />
              <a class="btn" href={`/days/${today}`}>
                <Icon name="edit" /> View & edit
              </a>
            </div>
            <SummaryBox day={day} />
          </section>
        )}

        <div class="grid-month" id="month">
          <section class="card">
            <div class="card-head">
              <CardTitle icon="calendar" title={monthLabel} sub={isCurrent ? 'This month at a glance' : 'Month overview'} />
              <div class="month-nav">
                {!isCurrent && (
                  <a class="btn ghost sm" href="/#month">
                    This month
                  </a>
                )}
                <a class="btn icon-btn" href={`/?month=${shiftMonth(month, -1)}#month`} title="Previous month" aria-label="Previous month">
                  <Icon name="back" />
                </a>
                {isCurrent ? (
                  <span class="btn icon-btn disabled" aria-hidden="true">
                    <Icon name="next" />
                  </span>
                ) : (
                  <a class="btn icon-btn" href={`/?month=${shiftMonth(month, 1)}#month`} title="Next month" aria-label="Next month">
                    <Icon name="next" />
                  </a>
                )}
              </div>
            </div>
            <div class="stats">
              <div class="stat">
                <div class="value grad-text">{worked.length}</div>
                <div class="label">Days worked</div>
              </div>
              <div class="stat">
                <div class="value">
                  {round1(totalHours)}
                  <small>h</small>
                </div>
                <div class="label">Total hours</div>
              </div>
              <div class="stat">
                <div class="value">
                  {round1(avg)}
                  <small>h</small>
                </div>
                <div class="label">Avg per day</div>
              </div>
            </div>
            <Calendar today={today} month={month} days={days} />
          </section>

          <section class="card">
            <div class="card-head">
              <CardTitle icon="clock" title={isCurrent ? 'Recent days' : `Days in ${fmtDate(`${month}-01`, { month: 'long' })}`} />
              <form method="get" action="/day" class="row" style="gap:6px">
                <input type="date" name="date" required aria-label="Pick a date" />
                <button class="btn">Open</button>
              </form>
            </div>
            {days.length ? (
              <div class="days">
                {(isCurrent ? days.slice(0, 7) : days).map((d) => (
                  <DayRow d={d} />
                ))}
              </div>
            ) : (
              <Empty icon="inbox">{isCurrent ? 'Nothing logged this month yet. Hit “Check in” to start.' : `Nothing logged in ${monthLabel}.`}</Empty>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
};

const Calendar: FC<{ today: string; month: string; days: WorkDay[] }> = ({ today, month, days }) => {
  const byDate = new Map(days.map((d) => [d.work_date, d]));
  const offset = parseLocal(`${month}-01 00:00:00`).getDay();
  const cells: Child[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w) => <div class="wd">{w}</div>);
  for (let i = 0; i < offset; i++) cells.push(<span></span>);
  for (let n = 1; n <= daysInMonth(month); n++) {
    const date = `${month}-${pad(n)}`;
    const d = byDate.get(date);
    const h = d ? hoursBetween(d.check_in_at, d.check_out_at) : null;
    // มี work detail แต่ไม่มีเวลา (เช่น backfill) → แสดงจุดบอกว่ามีงาน
    const workOnly = !h && !!d?.summary && d.summary_status === 'done';
    const cls = [
      heatLevel(h),
      workOnly ? 'has-work' : '',
      date === today ? 'is-today' : '',
      date > today ? 'future' : '',
      d?.summary_status === 'error' ? 'has-error' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const label = fmtDate(date, { day: 'numeric', month: 'short' });
    cells.push(
      date > today ? (
        <span class={`cell ${cls}`}>{n}</span>
      ) : (
        <a href={`/days/${date}`} class={cls} title={h ? `${label} · ${h}h` : workOnly ? `${label} · work logged, no hours` : label}>
          {n}
        </a>
      ),
    );
  }
  return (
    <>
      <div class="cal">{cells}</div>
      <div class="legend">
        <span class="legend-work">
          <i class="dot-work"></i> Work, no hours
        </span>
        Less <i></i>
        <i class="l1"></i>
        <i class="l2"></i>
        <i class="l3"></i>
        <i class="l4"></i> More
      </div>
    </>
  );
};

/** งานแรกของ work detail: bullet แรก (ข้ามบรรทัดหัวข้อชื่อ repo) ถ้าไม่มี bullet ใช้บรรทัดแรกที่ไม่ใช่หัวข้อ */
function previewLine(summary: string | null): string | undefined {
  const lines = summary?.split('\n').map((l) => l.trim()) ?? [];
  const bullet = lines.find((l) => /^[-*•]\s+/.test(l));
  return (bullet ?? lines.find((l) => l && !l.startsWith('#')))?.replace(/^[-*•]\s+/, '');
}

const DayRow: FC<{ d: WorkDay }> = ({ d }) => {
  const h = hoursBetween(d.check_in_at, d.check_out_at);
  return (
    <a class="day-row" href={`/days/${d.work_date}`}>
      <div class="day-date">
        <div class="d">{Number(d.work_date.slice(8))}</div>
        <div class="w">{weekdayOf(d.work_date)}</div>
      </div>
      <div style="min-width:0">
        <div class="day-times">
          <span>
            {timeOf(d.check_in_at) || '--:--'} → {timeOf(d.check_out_at) || '--:--'}
          </span>
          <StatusBadge status={d.summary_status} />
        </div>
        <div class="day-preview">{previewLine(d.summary) ?? <span class="muted">No summary yet</span>}</div>
      </div>
      <div class="day-hours">
        {h !== null ? round1(h) : '–'}
        <small>hours</small>
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
    <Layout title={fmtDate(date, { day: 'numeric', month: 'short', year: 'numeric' })} msg={msg} active="day">
      <div class="page-head">
        <div>
          <a href="/" class="back-link">
            <Icon name="back" /> Back to today
          </a>
          <h1>{fmtDate(date, LONG_DATE)}</h1>
        </div>
        {day && <StatusBadge status={day.summary_status} />}
      </div>

      <div class="stack">
        <div class="grid-2">
          <section class="card">
            <div class="card-head">
              <CardTitle icon="clock" title="Hours" sub="Fix it here if you forgot to check in or out" />
            </div>
            <form method="post" action={`/days/${date}/times`} class="time-inputs">
              <label>
                Check in
                <input type="time" name="check_in" value={timeOf(day?.check_in_at)} />
              </label>
              <label>
                Check out
                <input type="time" name="check_out" value={timeOf(day?.check_out_at)} />
              </label>
              <button class="btn">Save</button>
            </form>
            <div class="stats" style="margin:22px 0 0">
              <div class="stat">
                <div class="value grad-text">
                  {h !== null ? round1(h) : '–'}
                  {h !== null && <small>h</small>}
                </div>
                <div class="label">Worked</div>
              </div>
              <div class="stat">
                <div class="value">{git ? totalCommits : '–'}</div>
                <div class="label">Commits</div>
              </div>
              <div class="stat">
                <div class="value">{git ? totalFiles : '–'}</div>
                <div class="label">Uncommitted files</div>
              </div>
            </div>
          </section>

          <section class="card">
            <div class="card-head">
              <CardTitle icon="git" title="Git activity" sub={git ? `Collected at ${git.collectedAt.slice(11, 16)}` : 'Not collected yet'} />
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
                        <span class="badge error" title={r.error}>
                          error
                        </span>
                      ) : (
                        <span class="muted" style="font-size:.82rem; white-space:nowrap">
                          {r.commits.length} commits · {r.uncommitted.files.length} uncommitted
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <details style="margin-top:14px">
                  <summary>Raw data</summary>
                  <pre class="raw">{JSON.stringify(git, null, 2)}</pre>
                </details>
              </>
            ) : (
              <Empty icon="git">Collected when you check out, or when you press “Re-scan git & summarize”.</Empty>
            )}
          </section>
        </div>

        <section class="card">
          <div class="card-head">
            <CardTitle icon="sparkle" title="Work detail" sub="Used to fill your timesheet at the end of the month" />
            <div class="row" style="gap:8px">
              {git && (
                <form method="post" action={`/days/${date}/summarize`}>
                  <button class="btn" disabled={running} title="Use when the agent failed, e.g. you hit your usage limit">
                    <Icon name="refresh" /> Retry with saved git data
                  </button>
                </form>
              )}
              <form method="post" action={`/days/${date}/summarize`}>
                <input type="hidden" name="recollect" value="1" />
                <button class="btn primary" disabled={running}>
                  <Icon name="sparkle" /> Re-scan git & summarize
                </button>
              </form>
            </div>
          </div>
          <SummaryBox day={day ?? emptyDay(date)} />
          <details style="margin-top:20px">
            <summary>Edit work detail manually</summary>
            <form method="post" action={`/days/${date}/summary`} style="margin-top:12px">
              <textarea name="summary">{day?.summary ?? ''}</textarea>
              <button class="btn" style="margin-top:10px">
                Save work detail
              </button>
            </form>
          </details>
        </section>
      </div>
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

type RepoResult = { repos?: string[]; error?: string };

const repoName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** รายการ repo ใน folder target ให้ติ๊กว่าจะ scan ตัวไหน (แสดงเฉพาะตอนเลือก multi) */
const RepoPicker: FC<{ s: Settings; candidates: RepoResult }> = ({ s, candidates }) => {
  const excluded = new Set(s.excludedRepos.map((n) => n.toLowerCase()));
  const repos = candidates.repos ?? [];
  const selected = repos.filter((r) => !excluded.has(repoName(r).toLowerCase())).length;
  return (
    <div class="field repo-picker">
      <div class="picker-head">
        <span class="field-label" style="margin:0">
          Repositories to scan
        </span>
        {repos.length > 0 && (
          <div class="row" style="gap:4px">
            <span class="picker-count" data-picker-count="">
              {selected} of {repos.length}
            </span>
            <button type="button" class="btn ghost sm" data-check-all="1">
              All
            </button>
            <button type="button" class="btn ghost sm" data-check-all="0">
              None
            </button>
          </div>
        )}
      </div>
      <input type="hidden" name="pickerFor" value={s.targetPath} />
      {!s.targetPath ? (
        <div class="picker-empty">Enter a path and save to see the repositories inside it.</div>
      ) : candidates.error ? (
        <div class="alert error">
          <Icon name="alert" /> <div>{candidates.error}</div>
        </div>
      ) : repos.length === 0 ? (
        <div class="picker-empty">No git repositories found one level inside this folder.</div>
      ) : (
        <div class="picker-list">
          {repos.map((r) => {
            const name = repoName(r);
            return (
              <label class="picker-item">
                <input type="hidden" name="repoShown" value={name} />
                <input type="checkbox" name="includeRepo" value={name} checked={!excluded.has(name.toLowerCase())} />
                <span class="switch" aria-hidden="true"></span>
                <span class="picker-name">
                  <Icon name="git" />
                  <strong title={name}>{name}</strong>
                </span>
              </label>
            );
          })}
        </div>
      )}
      <div class="hint">Turned-off repos are skipped when summarizing. New repos added to this folder are scanned automatically.</div>
    </div>
  );
};

export const SettingsPage: FC<{ s: Settings; candidates: RepoResult; test?: RepoResult; msg?: string }> = ({
  s,
  candidates,
  test,
  msg,
}) => (
  <Layout title="Settings" msg={msg} active="settings">
    <div class="page-head">
      <div>
        <div class="eyebrow">Settings</div>
        <h1>Configure WorkingLab</h1>
      </div>
    </div>

    <form method="post" action="/settings" class="stack">
      <section class="card">
        <div class="card-head">
          <CardTitle icon="folder" title="Target folder" sub="Where WorkingLab looks for what you changed in git" />
        </div>
        <label class="field">
          <span class="field-label">Path</span>
          <input type="text" name="targetPath" value={s.targetPath} placeholder="e.g. D:\projects" />
        </label>
        <div class="field">
          <span class="field-label">Folder type</span>
          <div class="options">
            <label class="option">
              <input type="radio" name="targetType" value="single" checked={s.targetType === 'single'} />
              <span class="icon-bubble">
                <Icon name="folder" />
              </span>
              <span>
                <strong>Single repo</strong>
                <small>The folder itself is one git repository</small>
              </span>
              <span class="check"></span>
            </label>
            <label class="option">
              <input type="radio" name="targetType" value="multi" checked={s.targetType === 'multi'} />
              <span class="icon-bubble">
                <Icon name="folders" />
              </span>
              <span>
                <strong>Multiple repos</strong>
                <small>Scan each repository one level inside</small>
              </span>
              <span class="check"></span>
            </label>
          </div>
        </div>
        <RepoPicker s={s} candidates={candidates} />
        <label class="field">
          <span class="field-label">Your git email(s)</span>
          <input type="text" name="authorEmails" value={s.authorEmails.join(', ')} placeholder="me@work.com, me@gmail.com" />
          <div class="hint">Used to tell which commits are yours. Separate several with commas. Leave empty to use each repo's git config user.email.</div>
        </label>
      </section>

      <section class="card">
        <div class="card-head">
          <CardTitle icon="sparkle" title="Agent" sub="Writes your work details and fills timesheets" />
        </div>
        <div class="field">
          <span class="field-label">CLI provider</span>
          <div class="options">
            {AGENT_PROVIDERS.map((p) => {
              const meta = AGENT_PROVIDER_META[p];
              return (
                <label class="option">
                  <input type="radio" name="agentProvider" value={p} checked={s.agentProvider === p} />
                  <span class="icon-bubble lang-flag">{p === 'claude' ? 'CL' : 'CU'}</span>
                  <span>
                    <strong>{meta.label}</strong>
                    <small>{meta.hint}</small>
                  </span>
                  <span class="check"></span>
                </label>
              );
            })}
          </div>
        </div>
        <div class="field">
          <span class="field-label">Language for work details & timesheets</span>
          <div class="options">
            {LANGUAGES.map((lang) => (
              <label class="option">
                <input type="radio" name="language" value={lang} checked={s.language === lang} />
                <span class="icon-bubble lang-flag">{lang === 'English' ? 'EN' : 'TH'}</span>
                <span>
                  <strong>{lang}</strong>
                  <small>{lang === 'English' ? 'Summaries & timesheet in English' : 'Summaries & timesheet in Thai'}</small>
                </span>
                <span class="check"></span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <div class="row">
        <button class="btn primary">Save settings</button>
        <button class="btn" name="test" value="1">
          <Icon name="refresh" /> Save & check scan
        </button>
      </div>
    </form>

    {test && (
      <section class="card" style="margin-top:20px">
        <div class="card-head">
          <CardTitle icon="git" title="Will be scanned" />
          {test.repos && <span class={`badge ${test.repos.length ? 'ok' : 'warn'}`}>{test.repos.length} repos</span>}
        </div>
        {test.error && (
          <div class="alert error">
            <Icon name="alert" /> <div>{test.error}</div>
          </div>
        )}
        {test.repos &&
          (test.repos.length ? (
            <ul class="repo-list">
              {test.repos.map((r) => (
                <li>
                  <Icon name="git" /> <span class="mono">{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="git">No git repositories found in this folder.</Empty>
          ))}
      </section>
    )}
  </Layout>
);

// ---------- timesheet ----------

const TS_STATUS: Record<TimesheetRow['status'], [string, string]> = {
  running: ['Generating', 'warn'],
  done: ['Ready', 'ok'],
  error: ['Failed', 'error'],
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
                <th>Month</th>
                <th>Template</th>
                <th>Created</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr>
                  <td class="num">
                    <strong>{fmtDate(`${r.month}-01`, { month: 'short', year: 'numeric' })}</strong>
                  </td>
                  <td>{r.template_name}</td>
                  <td class="num muted">{r.created_at.slice(0, 16)}</td>
                  <td>
                    <span class={`badge ${TS_STATUS[r.status][1]}`}>{TS_STATUS[r.status][0]}</span>
                    {r.error && (
                      <div class="error" style="font-size:.8rem; margin-top:4px; max-width:360px">
                        {r.error}
                      </div>
                    )}
                  </td>
                  <td style="text-align:right">
                    {r.status === 'done' && (
                      <a class="btn" href={`/timesheet/${r.id}/download`}>
                        <Icon name="download" /> Download
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="sheet">No timesheets yet</Empty>
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
        <h1>Month-end timesheet</h1>
      </div>
    </div>

    <div class="stack">
      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <CardTitle
              icon="file"
              title={
                <>
                  <span class="step-num">1</span> Template
                </>
              }
              sub="Your company's .xlsx format"
            />
          </div>
          {template ? (
            <div class="file-pill">
              <span class="icon-bubble">
                <Icon name="check" />
              </span>
              <div style="min-width:0">
                <strong style="word-break:break-all">{template.original_name}</strong>
                <div class="muted" style="font-size:.78rem">
                  Uploaded {template.uploaded_at.slice(0, 16)}
                </div>
              </div>
            </div>
          ) : (
            <p class="muted" style="margin:0 0 14px">
              No template uploaded yet.
            </p>
          )}
          <form method="post" action="/timesheet/template" enctype="multipart/form-data" class="dropzone">
            <input type="file" name="file" accept=".xlsx" required />
            <button class="btn">
              <Icon name="upload" /> {template ? 'Replace' : 'Upload'}
            </button>
          </form>
        </section>

        <section class="card">
          <div class="card-head">
            <CardTitle
              icon="sparkle"
              title={
                <>
                  <span class="step-num">2</span> Generate
                </>
              }
              sub="The agent fills the month's work details into your template"
            />
          </div>
          <form method="post" action="/timesheet/generate" class="row">
            <input type="month" name="month" value={month} required />
            <button class="btn primary" disabled={!template}>
              <Icon name="sparkle" /> Generate timesheet
            </button>
          </form>
          <p class="hint">This can take a few minutes. Feel free to keep using the app meanwhile.</p>
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <CardTitle icon="download" title="Generated timesheets" />
        </div>
        <TimesheetList rows={rows} />
      </section>
    </div>
  </Layout>
);
