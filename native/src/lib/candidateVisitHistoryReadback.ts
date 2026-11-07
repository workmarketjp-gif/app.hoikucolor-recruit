/**
 * Validate the candidate-owned hc_jobseeker_list_my_visits SQL result.
 * An invalid RPC success value must never be presented as an empty visit
 * history. This is a client integrity check, not an authorization boundary:
 * the server owns candidate isolation and private visit access.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = () => new Error('見学・体験の履歴を確認できませんでした。再読み込みしてください。');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isText = (value: unknown): value is string => typeof value === 'string';
const isNonblank = (value: unknown): value is string => isText(value) && value.trim().length > 0;
const isNullableText = (value: unknown) => value === null || isText(value);
const isTimestamp = (value: unknown): value is string => isNonblank(value) && Number.isFinite(Date.parse(value));
const isNullableTimestamp = (value: unknown) => value === null || isTimestamp(value);

export function assertCandidateVisitHistoryReadback(data: unknown): asserts data is Record<string, unknown>[] {
  if (!Array.isArray(data)) throw fail();
  const seen = new Set<string>();
  for (const row of data) {
    if (!isRecord(row) || !isUuid(row.reservation_id) || !isUuid(row.job_id) ||
        (row.application_id !== null && !isUuid(row.application_id)) ||
        !isNonblank(row.facility_name) || !isNonblank(row.job_title) ||
        !isNullableText(row.prefecture) || !isNullableText(row.city) || !isNullableText(row.address) ||
        !['visit', 'half_day_trial', 'full_day_trial'].includes(row.experience_type as string) ||
        !isTimestamp(row.starts_at) || !isTimestamp(row.ends_at) ||
        Date.parse(row.ends_at as string) <= Date.parse(row.starts_at as string) ||
        !isNonblank(row.status) || !isNullableText(row.candidate_message) ||
        !isNullableTimestamp(row.confirmed_at) || !isNullableTimestamp(row.cancelled_at) ||
        !isNullableTimestamp(row.completed_at) || !isTimestamp(row.created_at) ||
        !isTimestamp(row.updated_at)) throw fail();
    const id = row.reservation_id.toLowerCase();
    if (seen.has(id)) throw fail();
    seen.add(id);
  }
}
