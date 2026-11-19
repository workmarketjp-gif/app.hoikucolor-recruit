/**
 * A submit is already confirmed by a candidate-owned canonical application
 * detail when this projection runs. Keep that proof visible if the *separate*
 * Spot list refresh fails: a stale open card must never invite another submit.
 * This does not authorize an application write, infer a success, or replace
 * the next canonical read.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SpotApplicationRow = Readonly<{
  job_id: string;
  application_id: string | null;
  application_status: string | null;
}>;

export function retainConfirmedSpotApplication<T extends SpotApplicationRow>(
  jobs: readonly T[], jobId: string, applicationId: string,
): T[] {
  if (!UUID.test(jobId) || !UUID.test(applicationId)) {
    throw new Error('応募結果を確認できませんでした。');
  }
  return jobs.map((job) => {
    if (job.job_id !== jobId) return job;
    if (job.application_id && job.application_id !== applicationId) {
      // Another confirmed ID takes precedence over the stale local projection.
      // Never mutate unrelated candidate/application evidence.
      return job;
    }
    // Never reuse a status associated with an older application or missing ID.
    const status = job.application_id === applicationId
      ? job.application_status || 'new'
      : 'new';
    return { ...job, application_id: applicationId, application_status: status };
  });
}

/**
 * A candidate-owned canonical detail has *already* confirmed the submission.
 * Local SecureStore cleanup is best-effort bookkeeping, never a second success
 * gate: a stalled store must not keep the successful user on the Apply screen.
 * An unresolved marker stays conservative and prevents a second dispatch.
 */
export function navigateAfterConfirmedSpotSubmission(options: {
  isCurrent: () => boolean;
  clearPending: () => Promise<void>;
  navigate: () => void;
}): void {
  if (!options.isCurrent()) return;
  try {
    void options.clearPending().catch(() => {
      // Preserve quarantine if cleanup cannot be confirmed; never retry RPC.
    });
  } catch {
    // Synchronous storage failure also does not invalidate canonical success.
  }
  if (options.isCurrent()) options.navigate();
}
