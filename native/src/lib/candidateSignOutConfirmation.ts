/** A confirmation cannot authorize logging out another candidate or a locked session. */
export function canConfirmCandidateSignOut(
  requestedOwnerKey: string | null,
  activeOwnerKey: string | null,
  privateAllowed: boolean,
  deletionBusy: boolean,
): boolean {
  return requestedOwnerKey !== null && requestedOwnerKey === activeOwnerKey &&
    privateAllowed && !deletionBusy;
}
