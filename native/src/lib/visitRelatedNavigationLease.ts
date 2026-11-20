import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Candidate visit-card navigation. Targets must belong to exactly one freshly
 * read visit and survive an unchanged Clerk owner/session. The optional
 * screen-local gate stops same-frame double taps; it is not authorization.
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

type NavigationGate = {
  begin: () => number | null;
  isCurrent: (ticket: number) => boolean;
  settle: (ticket: number, holdUntilBlur?: boolean) => boolean;
};

export async function navigateFromCandidateVisitWithLease(params: {
  visits: readonly CandidateVisitLinkRow[] | null;
  reservationId: string;
  targetId: string;
  target: 'job' | 'application';
  expectedOwnerKey: string | null;
  isViewCurrent: () => boolean;
  pin: () => Promise<PinnedNavigationSession | null>;
  navigate: () => void;
  gate?: NavigationGate;
  timeoutMs?: number;
}): Promise<boolean> {
  const matching = params.visits?.filter((row) => row.reservation_id === params.reservationId) ?? [];
  if (matching.length !== 1 || !params.expectedOwnerKey || !params.isViewCurrent()) return false;
  const targetId = params.target === 'application' ? matching[0].application_id : matching[0].job_id;
  if (!targetId || targetId !== params.targetId) return false;

  // Claim before the first await. A different link in the same frame must not
  // dispatch another token pin or queue a second router.push.
  const ticket = params.gate?.begin();
  if (params.gate && ticket === null) return false;
  const isCurrent = () => params.isViewCurrent() &&
    (ticket == null || params.gate?.isCurrent(ticket) === true);
  let navigated = false;
  try {
    // Token acquisition may hang; a presentation deadline does not cancel the
    // underlying Clerk request or authorize a route with a late token.
    // Preserve Web/Native link behavior: start the verified tap's pin now;
    // a later focus loss only rejects its result and never launches a new pin.
    const pinPromise = params.pin();
    const pinned = await boundedPrivateRead(() => pinPromise, params.timeoutMs);
    if (!pinned || !isCurrent() || pinned.ownerKey !== params.expectedOwnerKey || !pinned.isCurrent()) return false;
    params.navigate();
    navigated = true;
    return true;
  } catch {
    // Never render opaque Clerk token errors, paths or private identifiers.
    return false;
  } finally {
    // A successful router.push retains the lane until focus cleanup; a failed
    // or timed-out attempt releases it. Late attempts cannot unlock new work.
    if (ticket !== undefined && ticket !== null) params.gate?.settle(ticket, navigated);
  }
}
