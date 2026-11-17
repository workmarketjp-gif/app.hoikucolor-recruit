/**
 * A previously verified document snapshot is not write-authoritative after a
 * refresh starts or fails. Keep the rows for read-only reference but require
 * a new complete candidate/application-verified read before opening or
 * attaching an application document.
 *
 * The React screen owns the read generation, pinned Clerk owner, App Lock and
 * foreground lease. This presentation predicate is not backend authorization.
 */
export function canUseApplicationDocumentSnapshotForAction(
  snapshotVerifiedForCurrentOwner: boolean,
  mostRecentReadVerified: boolean,
): boolean {
  return snapshotVerifiedForCurrentOwner && mostRecentReadVerified;
}
