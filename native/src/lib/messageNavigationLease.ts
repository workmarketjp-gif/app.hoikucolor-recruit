/**
 * Presentation-only guard for opening a private application message thread.
 * This is not an authorization decision: the pinned Clerk/Supabase client and
 * server-side candidate ownership/RLS remain authoritative.
 *
 * A navigation that began while the inbox was visible may finish after
 * App Lock, account replacement, or a focus-based canonical refresh. Do not
 * navigate using the previously captured rows in any of those cases.
 */
export type MessageNavigationLease = Readonly<{
  applicationId: string;
  authorizedApplicationIds: readonly string[];
  expectedOwnerKey: string | null;
  resolvedOwnerKey: string | null;
  freshlyVerifiedOwnerKey: string | null;
  startedGeneration: number;
  currentGeneration: number;
  privateDataAllowed: boolean;
}>;

export function messageNavigationLeaseIsCurrent(lease: MessageNavigationLease): boolean {
  return lease.privateDataAllowed &&
    typeof lease.applicationId === 'string' && lease.applicationId.length > 0 &&
    typeof lease.expectedOwnerKey === 'string' && lease.expectedOwnerKey.length > 0 &&
    lease.expectedOwnerKey === lease.resolvedOwnerKey &&
    lease.expectedOwnerKey === lease.freshlyVerifiedOwnerKey &&
    Number.isSafeInteger(lease.startedGeneration) &&
    lease.startedGeneration === lease.currentGeneration &&
    lease.authorizedApplicationIds.includes(lease.applicationId);
}
