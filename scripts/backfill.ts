// สรุป work detail ย้อนหลังทีละวันจาก git (ใช้ทดสอบ gen timesheet ของเดือนที่ผ่านมา)
//
//   npm run backfill -- --dry-run                        ดูก่อนว่าวันไหนมีงาน ยังไม่เรียก agent ไม่เขียน DB
//   npm run backfill                                     ค่าเริ่มต้น: วันแรกของเดือนที่แล้ว ถึง เมื่อวาน
//   npm run backfill -- --from 2026-10-01 --to 2026-10-31
//   npm run backfill -- --force                          สรุปทับวันที่สรุปไว้แล้ว
//   npm run backfill -- --force --use-saved              สรุปใหม่จากข้อมูล git ที่เก็บไว้ (ไม่ scan git ใหม่)
//                                                        เช่นหลังเปลี่ยนภาษาในหน้าตั้งค่า
//
// - วันที่ไม่มีงานใน git จะไม่ถูกสร้างใน DB (ไม่ทำให้ปฏิทิน / timesheet รก)
// - วันที่สรุปสำเร็จแล้วจะถูกข้าม (ยกเว้น --force)
// - เรียก agent ทีละวันตามลำดับ เพื่อไม่ให้ใช้โควตา Claude Pro พุ่งทีเดียว
// - ไม่ได้ใส่เวลาเข้า-เลิกงาน (ไม่มีข้อมูลย้อนหลัง) แก้ได้ในหน้ารายวัน
import { getDay, getSettings, saveGitData } from '../src/db';
import { collectDay, hasWork, type GitDayData } from '../src/git';
import { summarizeDay } from '../src/summary';
import { DATE_RE, localDate } from '../src/time';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

const today = localDate();
const firstOfLastMonth = (() => {
  const d = new Date();
  return localDate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
})();

const from = arg('from') ?? firstOfLastMonth;
const to = arg('to') ?? addDays(today, -1);
const dryRun = flag('dry-run');
const force = flag('force');
const useSaved = flag('use-saved');

if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
  console.error(`Invalid range: --from ${from} --to ${to} (use YYYY-MM-DD, from <= to)`);
  process.exit(1);
}

const settings = getSettings();
console.log(
  `Backfill ${from} → ${to}${dryRun ? ' (dry run: no agent calls, nothing saved)' : ''}${useSaved ? ' (using saved git data)' : ''}`,
);
console.log(`Target: ${settings.targetPath} (${settings.targetType})  Language: ${settings.language}\n`);

const started = Date.now();
const counts = { summarized: 0, failed: 0, skipped: 0, empty: 0 };

for (let date = from; date <= to; date = addDays(date, 1)) {
  const existing = getDay(date);
  if (!force && existing?.summary_status === 'done' && existing.summary) {
    console.log(`${date}  skip   already summarized`);
    counts.skipped++;
    continue;
  }

  // --use-saved: ใช้ข้อมูล git ที่เก็บไว้แล้ว ถ้าวันนั้นยังไม่มี ค่อย scan ใหม่
  const saved = useSaved && existing?.git_data ? (JSON.parse(existing.git_data) as GitDayData) : null;
  const data = saved ?? (await collectDay(date, settings));
  if (!hasWork(data)) {
    console.log(`${date}  -      no git changes`);
    counts.empty++;
    continue;
  }

  const detail = data.repos
    .filter((r) => r.commits.length || r.uncommitted.files.length)
    .map((r) => `${r.name}: ${r.commits.length}c/${r.uncommitted.files.length}f`)
    .join(', ');

  if (dryRun) {
    console.log(`${date}  work   ${detail}`);
    counts.summarized++;
    continue;
  }

  process.stdout.write(`${date}  ...    ${detail}`);
  const t = Date.now();
  if (!saved) saveGitData(date, JSON.stringify(data));
  await summarizeDay(date, false);
  const day = getDay(date);
  const secs = Math.round((Date.now() - t) / 1000);
  if (day?.summary_status === 'done') {
    console.log(`  ✓ ${secs}s`);
    counts.summarized++;
  } else {
    console.log(`  ✗ ${day?.summary_error ?? 'unknown error'}`);
    counts.failed++;
    // โควตาหมดหรือ login หลุด: วันถัดไปก็จะล้มเหมือนกัน หยุดเลย (ข้อมูล git ที่เก็บแล้วยังอยู่ กด Retry ได้ภายหลัง)
    if (/limit|quota|logged in|login/i.test(day?.summary_error ?? '')) {
      console.log('\nStopping: the agent is unavailable (usage limit or login). Re-run later; finished days are skipped.');
      break;
    }
  }
}

const mins = ((Date.now() - started) / 60_000).toFixed(1);
console.log(
  `\n${dryRun ? 'Days with work' : 'Summarized'}: ${counts.summarized}  Failed: ${counts.failed}  ` +
    `Already done: ${counts.skipped}  No changes: ${counts.empty}  (${mins} min)`,
);
