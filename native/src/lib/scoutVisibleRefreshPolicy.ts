/** Keep the Web's 60-second visible Scout Inbox refresh without polling a
 * backgrounded, locked or unverified Native candidate view. Read-only policy:
 * the actual RPC, pinned session and RLS remain authoritative. */
export const SCOUT_VISIBLE_REFRESH_MS = 60_000;

export type ScoutVisibleRefreshState = Readonly<{
  appActive: boolean;
  privateAllowed: boolean;
  ownerKey: string | null;
  verifiedOwnerKey: string | null;
  scoutsVerified: boolean;
  loading: boolean;
  busy: boolean;
  writePending: boolean;
  searchPending: boolean;
  refreshPending: boolean;
}>;

export function mayRefreshVisibleScoutInbox(state: ScoutVisibleRefreshState): boolean {
  return state.appActive && state.privateAllowed
    && typeof state.ownerKey === 'string' && state.ownerKey.length > 0
    && state.verifiedOwnerKey === state.ownerKey
    && state.scoutsVerified && !state.loading && !state.busy
    && !state.writePending && !state.searchPending && !state.refreshPending;
}
