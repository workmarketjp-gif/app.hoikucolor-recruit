/**
 * Validate the canonical job-detail RPC boundary without changing server data.
 * A genuine SETOF empty array means no accessible job. A malformed response,
 * duplicate row or wrong job identity must never masquerade as not found or
 * populate another job's application / saved-action screen.
 *
 * Authorization remains exclusively in the authenticated Supabase RPC/RLS.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new Error('求人詳細を確認できませんでした。再読み込みしてください。');

export function verifiedCandidateJobDetail<T>(data: unknown, requestedJobId: string): T | null {
  if (typeof requestedJobId !== 'string' || !UUID.test(requestedJobId) || !Array.isArray(data) || data.length > 1) {
    throw invalid();
  }
  if (data.length === 0) return null;
  const job: unknown = data[0];
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw invalid();
  const row = job as Record<string, unknown>;
  if (typeof row.id !== 'string' || !UUID.test(row.id) ||
      row.id.toLowerCase() !== requestedJobId.toLowerCase() ||
      typeof row.facility_id !== 'string' || !UUID.test(row.facility_id) ||
      typeof row.title !== 'string' || !row.title.trim() ||
      typeof row.facility_name !== 'string' || !row.facility_name.trim()) {
    throw invalid();
  }
  return job as T;
}
