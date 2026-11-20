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

/**
 * Web preserves tappable confirmed application rows while a same-session list
 * refresh is pending or has failed. A refresh is not a mutation of those rows:
 * the detail route re-fetches and re-authorizes the selected application.
 * Never re-enable an unverified/old-session row or duplicate stack pushes.
 */
export function canNavigateVerifiedApplicationRow(options: {
  ownerKey: string | null;
  freshlyVerifiedOwnerKey: string | null;
  hasVisibleRows: boolean;
  privateAllowed: boolean;
  navigationPending: boolean;
}): boolean {
  return options.hasVisibleRows && options.privateAllowed && !options.navigationPending &&
    options.ownerKey !== null && options.freshlyVerifiedOwnerKey === options.ownerKey;
}
