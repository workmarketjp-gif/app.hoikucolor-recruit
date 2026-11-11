/**
 * Date-only profile selection for the jobseeker Web <input type="date">.
 * Unlike visit bookings, the Web profile field has no minimum, maximum or
 * weekday restriction. Use Gregorian calendar dates, not device-local ISO
 * timestamp conversion (which can shift the selected day).
 */
export function isProfileCalendarDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return day >= 1 && day <= maxDay;
}

export function profileCalendarToday(now: Date = new Date()): string {
  // The Web date input opens in the device's local calendar, not in Japan time.
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function profileCalendarInitialMonth(value: string | null | undefined, today: string): string {
  return (isProfileCalendarDate(value) ? value : today).slice(0, 7);
}

/** Month and year controls; never roll over beyond the four-digit Web date range. */
export function shiftProfileCalendarMonth(month: string, offset: -12 | -1 | 1 | 12): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || year > 9999 || monthNumber < 1 || monthNumber > 12) return null;
  const zeroBased = (year - 1) * 12 + (monthNumber - 1) + offset;
  if (zeroBased < 0 || zeroBased >= 9999 * 12) return null;
  const nextYear = Math.floor(zeroBased / 12) + 1;
  return `${String(nextYear).padStart(4, '0')}-${String(zeroBased % 12 + 1).padStart(2, '0')}`;
}

/** Monday-first; cells contain only valid calendar dates and blank padding. */
export function profileCalendarCells(month: string): Array<string | null> {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || year > 9999 || monthNumber < 1 || monthNumber > 12) return [];
  // setUTCFullYear avoids JS Date's special 1900 offset for years 0–99.
  const first = new Date(0);
  first.setUTCHours(0, 0, 0, 0);
  first.setUTCFullYear(year, monthNumber - 1, 1);
  const last = new Date(0);
  last.setUTCHours(0, 0, 0, 0);
  last.setUTCFullYear(year, monthNumber, 0);
  const cells: Array<string | null> = Array((first.getUTCDay() + 6) % 7).fill(null);
  for (let day = 1; day <= last.getUTCDate(); day++) {
    cells.push(`${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
