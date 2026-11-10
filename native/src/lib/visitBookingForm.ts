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
