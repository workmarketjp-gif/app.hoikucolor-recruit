/** Candidate-only Spot RPC read boundary. Only a genuine empty array is an empty state. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;

type Row = Record<string, unknown>;
const objectRow = (value: unknown): value is Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const schedule = (row: Row) => typeof row.work_date === 'string' && DATE.test(row.work_date) &&
  typeof row.start_time === 'string' && TIME.test(row.start_time) &&
  typeof row.end_time === 'string' && TIME.test(row.end_time) &&
  count(row.break_minutes) && (row.break_minutes as number) < 1440 && money(row.hourly_rate);

const badSpotRead = () => new Error('スポット勤務の情報を確認できませんでした。再読み込みしてください。');
const badAssignmentRead = () => new Error('スポット勤務の履歴を確認できませんでした。再読み込みしてください。');

/** Validate before casting the RPC table result into the existing Native model. */
export function readCanonicalSpotJobs<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw badSpotRead();
  const seen = new Set<string>();
  for (const value of data) {
    if (!objectRow(value) || !id(value.job_id) || seen.has(value.job_id) ||
        !id(value.facility_id) || !text(value.facility_name) || !text(value.title) ||
        !schedule(value) || !count(value.required_count) || value.required_count === 0 ||
        !count(value.confirmed_count) || !count(value.available_count) ||
        (value.available_count as number) > (value.required_count as number) ||
        !(value.application_id === null || id(value.application_id)) ||
        !(value.application_status === null || typeof value.application_status === 'string')) {
      throw badSpotRead();
    }
    seen.add(value.job_id);
  }
  return data as T[];
}

/** Private assignment list must not silently become empty or accept unrelated IDs. */
export function readCanonicalSpotAssignments<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw badAssignmentRead();
  const seen = new Set<string>();
  for (const value of data) {
    if (!objectRow(value) || !id(value.assignment_id) || seen.has(value.assignment_id) ||
        !id(value.application_id) || !id(value.job_id) || !id(value.facility_id) ||
        !text(value.facility_name) || !text(value.title) || !schedule(value) ||
        !text(value.assignment_status) || !text(value.confirmed_at)) {
      throw badAssignmentRead();
    }
    seen.add(value.assignment_id);
  }
  return data as T[];
}

/** Stop a double tap, a stale list tap and a post-account-switch submission. */
export function canStartSpotApplication(input: {
  jobId: string;
  visibleJobs: readonly Readonly<{ job_id: string; application_id: string | null; available_count: number }>[];
  ownerKey: string | null;
  verifiedOwnerKey: string | null;
  privateAllowed: boolean;
  pending: boolean;
}): boolean {
  return Boolean(input.privateAllowed && input.ownerKey &&
    input.ownerKey === input.verifiedOwnerKey && !input.pending &&
    id(input.jobId) && input.visibleJobs.some((job) =>
      job.job_id === input.jobId && job.application_id === null &&
      Number.isSafeInteger(job.available_count) && job.available_count > 0));
}
