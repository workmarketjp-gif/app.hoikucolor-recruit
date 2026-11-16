/**
 * Web /jobs?job_id=… parity. A route parameter is only a discovery hint;
 * it never grants access or bypasses the canonical job RPC / candidate pin.
 */
const WEB_JOB_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function specifiedJobIdFromRoute(param: string | string[] | undefined): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  return typeof value === 'string' && WEB_JOB_UUID.test(value) ? value.toLowerCase() : null;
}

export function specifiedJobIdToRead(options: {
  jobId: string | null;
  reset: boolean;
  keyword: string;
  hasFilters: boolean;
}): string | null {
  return options.reset && !options.keyword.trim() && !options.hasFilters ? options.jobId : null;
}

/** A missing/invalid canonical row is never fabricated from a deep-link id. */
export function presentSpecifiedJobPage<T extends { id: string }>(
  pageJobs: readonly T[], jobId: string | null, canonicalJob: T | null,
): { jobs: T[]; specifiedJobId: string | null; notice: string | null } {
  if (!jobId) return { jobs: [...pageJobs], specifiedJobId: null, notice: null };
  if (!canonicalJob || canonicalJob.id.toLowerCase() !== jobId) {
    return {
      jobs: [...pageJobs],
      specifiedJobId: null,
      notice: 'この求人は公開を終了したか、現在は表示できません。求人一覧から最新の募集をご確認ください。',
    };
  }
  return {
    jobs: [canonicalJob, ...pageJobs.filter((job) => job.id.toLowerCase() !== jobId)],
    specifiedJobId: jobId,
    notice: null,
  };
}
