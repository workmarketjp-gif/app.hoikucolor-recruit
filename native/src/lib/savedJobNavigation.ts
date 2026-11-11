import { presentSavedJobCard, type SavedJobCardSource } from './savedJobCardPresentation.ts';

/**
 * A saved-card button only requests navigation, never creates an application or
 * visit. Job Detail rechecks the canonical job, profile, prior applications and
 * candidate session before showing its existing document-selection step.
 */
export type SavedJobDestination = 'detail' | 'apply' | 'visit';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function savedJobNavigationPath(
  jobId: string,
  job: SavedJobCardSource,
  destination: SavedJobDestination,
  now: number,
): string | null {
  if (!UUID.test(jobId) || !Number.isFinite(now)) return null;
  const details = presentSavedJobCard(job, now);
  if (destination === 'apply' && !details.directApply) return null;
  if (destination === 'visit' && !details.canVisit) return null;
  const id = encodeURIComponent(jobId.toLowerCase());
  if (destination === 'apply') return `/job/${id}?apply=1`;
  if (destination === 'visit') return `/visits?jobId=${id}`;
  return `/job/${id}`;
}
