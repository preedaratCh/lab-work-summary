// เวลาทั้งหมดในระบบเป็นเวลาท้องถิ่นของเครื่อง เก็บเป็นข้อความ "YYYY-MM-DD HH:MM:SS"

const pad = (n: number) => String(n).padStart(2, '0');

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localDateTime(d = new Date()): string {
  return `${localDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseLocal(dt: string): Date {
  return new Date(dt.replace(' ', 'T'));
}

/** "HH:MM" จาก "YYYY-MM-DD HH:MM:SS" */
export function timeOf(dt: string | null | undefined): string {
  return dt ? dt.slice(11, 16) : '';
}

export function hoursBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const ms = parseLocal(to).getTime() - parseLocal(from).getTime();
  return ms > 0 ? Math.round((ms / 3_600_000) * 100) / 100 : null;
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** เลื่อนเดือน "YYYY-MM" ไป n เดือน (ติดลบ = ย้อนหลัง) */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayOf(date: string, lang: 'th' | 'en' = 'en'): string {
  const d = parseLocal(`${date} 00:00:00`).getDay();
  return (lang === 'th' ? WEEKDAYS : WEEKDAYS_EN)[d];
}
