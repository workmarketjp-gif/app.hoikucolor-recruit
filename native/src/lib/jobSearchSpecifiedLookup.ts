import { boundedPrivateRead } from './privateReadDeadline.ts';
import { presentSpecifiedJobPage } from './jobSearchSpecifiedEntry.ts';

export type SpecifiedJobLookup<T> =
  | { kind: 'skipped'; job: null }
  | { kind: 'verified'; job: T }
  | { kind: 'unavailable'; job: null }
  | { kind: 'failed'; job: null };

/**
 * A deep-link hint is optional to the canonical job list. A slow, failed or
 * malformed exact-job read must not turn a successful public search page into
 * a failed search, and it must never fabricate the requested vacancy.
 * Keep the same authorized pinned client supplied by the caller; no retry.
 */
export async function readOptionalSpecifiedJob<T extends { id: string }>(
  jobId: string | null,
  read: (id: string) => Promise<T | null>,
  timeoutMs = 5_000,
): Promise<SpecifiedJobLookup<T>> {
  if (!jobId) return { kind: 'skipped', job: null };
  try {
    const job = await boundedPrivateRead(() => read(jobId), timeoutMs);
    if (job === null) return { kind: 'unavailable', job: null };
    if (!job || typeof job.id !== 'string' || job.id.toLowerCase() !== jobId.toLowerCase()) {
      return { kind: 'failed', job: null };
    }
    return { kind: 'verified', job };
  } catch {
    return { kind: 'failed', job: null };
  }
}

/** Report lookup failure as UNKNOWN, not as a verified closed/withdrawn job. */
export function presentOptionalSpecifiedJobPage<T extends { id: string }>(
  pageJobs: readonly T[],
  requestedId: string | null,
  lookup: SpecifiedJobLookup<T>,
): { jobs: T[]; specifiedJobId: string | null; notice: string | null } {
  if (lookup.kind === 'failed' && requestedId) {
    return {
      jobs: [...pageJobs],
      specifiedJobId: null,
      notice: '指定求人を確認できませんでした。検索結果は表示しています。再検索して最新の募集をご確認ください。',
    };
  }
  return presentSpecifiedJobPage(pageJobs, requestedId, lookup.kind === 'verified' ? lookup.job : null);
}
