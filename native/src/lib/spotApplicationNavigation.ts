/**
 * Candidate-owned presentation gate for opening a Spot application detail.
 * A card's application_id must be present in the latest verified Spot snapshot
 * and the same session must still be unlocked after the bounded Clerk pin.
 * This is NOT server authorization: the application detail RPC/RLS remains authoritative.
 */
export type SpotApplicationNavigationLease = Readonly<{
  applicationId: string;
  visibleApplicationIds: readonly (string | null)[];
  expectedOwnerKey: string | null;
  currentOwnerKey: string | null;
  verifiedOwnerKey: string | null;
  resolvedOwnerKey: string | null;
  startedGeneration: number;
  currentGeneration: number;
  privateAllowed: boolean;
  applicationPending: boolean;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function canOpenVerifiedSpotApplication(lease: SpotApplicationNavigationLease): boolean {
  const owner = lease.expectedOwnerKey;
  return Boolean(owner && lease.privateAllowed && !lease.applicationPending &&
    owner === lease.currentOwnerKey && owner === lease.verifiedOwnerKey &&
    owner === lease.resolvedOwnerKey &&
    Number.isSafeInteger(lease.startedGeneration) &&
    lease.startedGeneration === lease.currentGeneration &&
    UUID.test(lease.applicationId) && lease.visibleApplicationIds.includes(lease.applicationId));
}
