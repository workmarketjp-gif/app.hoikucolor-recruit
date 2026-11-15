/**
 * A failed candidate-session token preflight is a retryable read failure only
 * while its original owner/request still owns the visible private screen.
 * A replaced Clerk session, App Lock, unmount or superseding read must not
 * surface a stale failure over the next candidate's data.
 */
export function mayPresentCareerReadFailure(
  requestedOwnerKey: string | null,
  visibleOwnerKey: string | null,
  requestedEpoch: number,
  activeEpoch: number,
  privateViewAllowed: boolean,
): boolean {
  return requestedOwnerKey !== null &&
    requestedOwnerKey === visibleOwnerKey &&
    requestedEpoch === activeEpoch &&
    privateViewAllowed;
}
