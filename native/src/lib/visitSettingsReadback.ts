/**
 * Candidate visit-settings RPC response integrity. This is a fail-closed client
 * presentation gate, not a substitute for server-side job/facility authorization.
 * A malformed success must not be treated as "no visits available" or trusted
 * to enable a booking form.
 */
export type VerifiedVisitSettings = {
  id: string;
  facility_id: string;
  visit_enabled: boolean;
  half_day_trial_enabled: boolean;
  full_day_trial_enabled: boolean;
  available_weekdays: number[];
  first_start_time: string;
  last_start_time: string;
  slot_interval_minutes: number;
  visit_duration_minutes: number;
  half_day_duration_minutes: number;
  full_day_duration_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  public_note: string | null;
  what_to_bring: string | null;
  dress_code: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = () => new Error('見学・体験の受付設定を確認できませんでした。再読み込みしてください。');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isUuid = (value: unknown) => typeof value === 'string' && UUID.test(value);
const isNullableText = (value: unknown) => value === null || typeof value === 'string';
const isNonNegativeInteger = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function minutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59 || (match[3] !== undefined && Number(match[3]) > 59)) return null;
  return hour * 60 + minute;
}

/** NULL or empty list means that no facility visit settings exist for this job. */
export function verifiedVisitSettingsReadback(data: unknown): VerifiedVisitSettings | null {
  if (data === null || (Array.isArray(data) && data.length === 0)) return null;
  if (Array.isArray(data) && (data.length !== 1 || data[0] === null)) throw fail();
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) throw fail();

  const start = minutes(row.first_start_time);
  const end = minutes(row.last_start_time);
  if (!isUuid(row.id) || !isUuid(row.facility_id) ||
      typeof row.visit_enabled !== 'boolean' ||
      typeof row.half_day_trial_enabled !== 'boolean' ||
      typeof row.full_day_trial_enabled !== 'boolean' ||
      !Array.isArray(row.available_weekdays) ||
      !row.available_weekdays.every((day: unknown) => typeof day === "number" && Number.isInteger(day) && day >= 1 && day <= 7) ||
      start === null || end === null || end < start ||
      !isNonNegativeInteger(row.slot_interval_minutes) ||
      !isNonNegativeInteger(row.visit_duration_minutes) ||
      !isNonNegativeInteger(row.half_day_duration_minutes) ||
      !isNonNegativeInteger(row.full_day_duration_minutes) ||
      !isNonNegativeInteger(row.min_notice_hours) ||
      !isNonNegativeInteger(row.max_days_ahead) ||
      !isNullableText(row.public_note) ||
      !isNullableText(row.what_to_bring) ||
      !isNullableText(row.dress_code)) throw fail();
  return row as VerifiedVisitSettings;
}
