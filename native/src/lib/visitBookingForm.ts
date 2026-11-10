/**
 * Native booking-time selection follows the existing Web VisitTrialPanel.
 * The canonical hc_request_visit RPC remains responsible for authorization,
 * notice, weekdays, slot availability and final validation.
 */
export type VisitSlotSettings = {
  first_start_time: string;
  last_start_time: string;
  slot_interval_minutes: number;
};

function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Web generates a dropdown from first_start_time through last_start_time inclusive. */
export function visitStartTimeSlots(settings: VisitSlotSettings | null): string[] {
  if (!settings) return [];
  const start = clockMinutes(settings.first_start_time);
  const end = clockMinutes(settings.last_start_time);
  if (start === null || end === null || end < start) return [];
  const interval = Number.isFinite(settings.slot_interval_minutes) && settings.slot_interval_minutes > 0
    ? Math.max(15, Math.trunc(settings.slot_interval_minutes)) : 30;
  const slots: string[] = [];
  for (let minutes = start; minutes <= end && slots.length < 97; minutes += interval) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    slots.push(hour + ':' + minute);
  }
  return slots;
}

/** Date input is text until a platform date picker is dependency-verified. Never send malformed dates. */
export function isValidVisitCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(0);
  parsed.setUTCHours(0, 0, 0, 0);
  parsed.setUTCFullYear(year, month - 1, day);
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function currentJobVisitReservation<T extends { job_id: string; status: string }>(
  visits: readonly T[] | null,
  jobId: string | null,
): T | null {
  if (!visits || !jobId) return null;
  return visits.find((visit) => visit.job_id === jobId &&
    (visit.status === 'requested' || visit.status === 'confirmed')) ?? null;
}

/** Client UX check only; the server is the sole authority for booking eligibility. */
export function isSelectableVisitDateTime(
  date: string,
  time: string,
  availableSlots: readonly string[],
): boolean {
  return isValidVisitCalendarDate(date) && availableSlots.includes(time);
}

/** Japan has no DST. Keep venue-calendar days independent of device timezone. */
export function japanVisitToday(instantMs: number): string {
  const date = new Date(instantMs + 9 * 60 * 60 * 1000);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function utcVisitDay(dateString: string): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  const [year, month, day] = dateString.split('-').map(Number);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

export function shiftVisitDay(dateString: string, days: number): string {
  const date = utcVisitDay(dateString);
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function shiftVisitCalendarMonth(month: string, shift: -1 | 1): string | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || year > 9999 || monthNumber < 1 || monthNumber > 12) return null;
  const next = year * 12 + (monthNumber - 1) + shift;
  const nextYear = Math.floor(next / 12);
  if (nextYear < 1 || nextYear > 9999) return null;
  return `${String(nextYear).padStart(4, '0')}-${String(next % 12 + 1).padStart(2, '0')}`;
}

/** Monday-first month grid. Null cells are padding, never selectable dates. */
export function visitCalendarCells(month: string): Array<string | null> {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (year < 1 || year > 9999 || monthNumber < 1 || monthNumber > 12) return [];
  const firstDay = utcVisitDay(`${match[1]}-${match[2]}-01`);
  const mondayPadding = (firstDay.getUTCDay() + 6) % 7;
  const lastDay = utcVisitDay(`${match[1]}-${match[2]}-01`);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  const cells: Array<string | null> = Array(mondayPadding).fill(null);
  for (let day = 1; day <= lastDay.getUTCDate(); day++) {
    cells.push(`${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Preflight usability only. Server controls exact notice/slot/authorization. */
export function isSelectableVisitCalendarDay(
  date: string,
  instantMs: number,
  maxDaysAhead: number,
  availableWeekdays: readonly number[],
): boolean {
  if (!isValidVisitCalendarDate(date) || !Number.isFinite(instantMs) ||
    !Number.isFinite(maxDaysAhead) || maxDaysAhead < 0) return false;
  const today = japanVisitToday(instantMs);
  if (date < today || date > shiftVisitDay(today, Math.trunc(maxDaysAhead))) return false;
  const jsDay = utcVisitDay(date).getUTCDay();
  const mondayFirst = jsDay === 0 ? 7 : jsDay;
  return availableWeekdays.includes(mondayFirst);
}
