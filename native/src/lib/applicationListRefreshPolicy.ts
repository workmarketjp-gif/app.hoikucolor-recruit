/**
 * Present previously verified application rows during a manual same-session
 * refresh, matching Web useResource's stale-data behavior. This grants no
 * authorization: the owning screen still requires a current private session,
 * canonical RPC checks and a pinned navigation lease. Focus/app-lock/account
 * changes must always invalidate the snapshot before the next canonical read.
 */
export function retainApplicationListForRefresh(options: {
  explicitRefresh: boolean;
  ownerKey: string | null;
  freshlyVerifiedOwnerKey: string | null;
  privateAllowed: boolean;
}): boolean {
  return options.explicitRefresh && options.privateAllowed &&
    options.ownerKey !== null &&
    options.freshlyVerifiedOwnerKey === options.ownerKey;
}
