/**
 * A candidate's manual application-list retry and focus refresh must never
 * issue duplicate private token/RPC reads from same-frame rapid interactions.
 * The component owns the synchronous in-flight ref and revokes it on blur,
 * App Lock or account replacement. Server authorization is unchanged.
 */
export function canStartApplicationIndexRead(options: {
  pending: boolean;
  expectedOwnerKey: string | null;
  privateAllowed: boolean;
}): boolean {
  return !options.pending && !!options.expectedOwnerKey && options.privateAllowed;
}
