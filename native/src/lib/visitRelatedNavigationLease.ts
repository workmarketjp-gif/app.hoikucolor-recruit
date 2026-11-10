/**
 * Candidate visit card navigation only. This checks presentation freshness,
 * not server authorization. Route targets must come from the freshly read,
 * candidate-owned visit row, then survive an asynchronous Clerk session pin.
 */
export type CandidateVisitLinkRow = Readonly<{
  reservation_id: string;
  job_id: string;
  application_id: string | null;
}>;

type PinnedNavigationSession = Readonly<{
  ownerKey: string | null;
  isCurrent: () => boolean;
}>;

export async function navigateFromCandidateVisitWithLease(params: {
  visits: readonly CandidateVisitLinkRow[] | null;
  reservationId: string;
  targetId: string;
  target: 'job' | 'application';
  expectedOwnerKey: string | null;
  isViewCurrent: () => boolean;
  pin: () => Promise<PinnedNavigationSession | null>;
  navigate: () => void;
}): Promise<boolean> {
  // A visible card is not enough to authorize a later navigation. Duplicate
  // IDs or a target not linked to this reservation fail closed.
  const matching = params.visits?.filter((row) => row.reservation_id === params.reservationId) ?? [];
  if (matching.length !== 1 || !params.expectedOwnerKey || !params.isViewCurrent()) return false;
  const targetId = params.target === 'application' ? matching[0].application_id : matching[0].job_id;
  if (!targetId || targetId !== params.targetId) return false;

  const pinned = await params.pin();
  if (!pinned || pinned.ownerKey !== params.expectedOwnerKey ||
      !pinned.isCurrent() || !params.isViewCurrent()) return false;
  params.navigate();
  return true;
}
