import Holidays from 'date-holidays';

const HOLIDAYS = new Holidays('TH');
HOLIDAYS.setTimezone('Asia/Bangkok');

export interface ThaiHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

function rowDate(h: { date: string; start?: Date }): string {
  if (typeof h.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(h.date)) return h.date.slice(0, 10);
  if (h.start) {
    const d = h.start;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

/** วันหยุดราชการไทยในเดือน (public only, ชื่ออังกฤษ) */
export function thaiHolidaysInMonth(month: string): ThaiHoliday[] {
  const year = Number(month.slice(0, 4));
  const rows = HOLIDAYS.getHolidays(year, 'en') ?? [];
  const out: ThaiHoliday[] = [];
  const seen = new Set<string>();
  for (const h of rows) {
    if (h.type !== 'public') continue;
    const date = rowDate(h);
    if (!date.startsWith(month)) continue;
    const key = `${date}\0${h.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ date, name: h.name });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** ชื่อวันหยุดของวันนั้น (ถ้ามี) */
export function thaiHolidayName(date: string): string | undefined {
  const rows = HOLIDAYS.isHoliday(new Date(`${date}T12:00:00+07:00`));
  if (!rows || !Array.isArray(rows)) return undefined;
  const pub = rows.find((h) => h.type === 'public');
  return pub?.name;
}