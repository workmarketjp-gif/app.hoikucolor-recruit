import { verifiedCandidateApplicationRows } from './candidateApplicationReadback.ts';

/**
 * Fail closed when the candidate-owned detail RPC returns a partial, corrupt or
 * cross-application nested result. A genuine SQL NULL still means that no
 * accessible application was found. Authorization remains server-side.
 *
 * The current SQL produces interviews/visits as arrays (including []).
 * Treating a missing collection as [] would silently hide an interview or
 * reservation, including its response/cancellation action.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure = () => new Error('応募詳細の整合性を確認できませんでした。再読み込みしてください。');
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const text = (value: unknown): value is string => typeof value === 'string';
const nonblank = (value: unknown): value is string => text(value) && value.trim().length > 0;
const nullableText = (value: unknown) => value === null || text(value);
const timestamp = (value: unknown): value is string =>
  nonblank(value) && Number.isFinite(Date.parse(value));
const nullableTimestamp = (value: unknown) => value === null || timestamp(value);
const optionalNullableText = (row: Record<string, unknown>, field: string) =>
  !(field in row) || nullableText(row[field]);
const optionalNullableTimestamp = (row: Record<string, unknown>, field: string) =>
  !(field in row) || nullableTimestamp(row[field]);

function validInterview(row: unknown, applicationId: string): row is Record<string, unknown> {
  if (!record(row)) return false;
  if (!uuid(row.id) || !uuid(row.application_id) || !sameId(row.application_id, applicationId) ||
      !timestamp(row.scheduled_at) || !timestamp(row.updated_at) ||
      !Number.isSafeInteger(row.duration_minutes) || (row.duration_minutes as number) <= 0 ||
      !nonblank(row.status) || !nullableText(row.location) || !nullableText(row.meeting_url) ||
      !optionalNullableText(row, 'candidate_response_message') ||
      !optionalNullableTimestamp(row, 'candidate_responded_at')) return false;
  if ('candidate_response_status' in row && row.candidate_response_status !== null &&
      row.candidate_response_status !== 'accepted' && row.candidate_response_status !== 'reschedule_requested') return false;
  return true;
}

function validVisit(row: unknown, applicationId: string, jobId: string): row is Record<string, unknown> {
  if (!record(row)) return false;
  if (!uuid(row.id) || !uuid(row.job_id) || !sameId(row.job_id, jobId) ||
      (row.application_id !== null && (!uuid(row.application_id) || !sameId(row.application_id, applicationId))) ||
      !['visit', 'half_day_trial', 'full_day_trial'].includes(row.experience_type as string) ||
      !timestamp(row.starts_at) || !timestamp(row.ends_at) ||
      Date.parse(row.ends_at as string) <= Date.parse(row.starts_at as string) ||
      !nonblank(row.status) || !nullableText(row.candidate_message) ||
      !nullableTimestamp(row.confirmed_at) || !nullableTimestamp(row.cancelled_at) ||
      !nullableTimestamp(row.completed_at) || !timestamp(row.updated_at)) return false;
  return true;
}

/**
 * Validate without re-shaping the server's response: preserve every canonical
 * field and optional extension for the application/interview/visit UI.
 * NULL is the only valid not-found result.
 */
export function assertCandidateApplicationDetailReadback(data: unknown, requestedApplicationId: string): void {
  if (!uuid(requestedApplicationId)) throw failure();
  if (data === null) return;
  if (!record(data) || !record(data.application) ||
      !Array.isArray(data.interviews) || !Array.isArray(data.visits)) throw failure();
  const application = verifiedCandidateApplicationRows([data.application])[0];
  if (!sameId(application.id, requestedApplicationId)) throw failure();

  const interviewIds = new Set<string>();
  for (const item of data.interviews) {
    if (!validInterview(item, application.id)) throw failure();
    const key = (item.id as string).toLowerCase();
    if (interviewIds.has(key)) throw failure();
    interviewIds.add(key);
  }
  const visitIds = new Set<string>();
  for (const item of data.visits) {
    if (!validVisit(item, application.id, application.job_id)) throw failure();
    const key = (item.id as string).toLowerCase();
    if (visitIds.has(key)) throw failure();
    visitIds.add(key);
  }
}
