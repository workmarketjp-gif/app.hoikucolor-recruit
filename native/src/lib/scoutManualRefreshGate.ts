/**
 * A user-initiated Scout reload may replace all candidate-private screen state.
 * In particular, never reset a form while its mutation may still be executing,
 * nor interrupt a candidate-scoped search/refresh already in progress.
 * Actual owner/session authorization remains the screen's pinned-read guard.
 */
export type ScoutManualRefreshState = Readonly<{
  privateAllowed: boolean;
  loading: boolean;
  busy: boolean;
  writePending: boolean;
  searchPending: boolean;
  refreshPending: boolean;
}>;

export function mayBeginScoutManualRefresh(state: ScoutManualRefreshState): boolean {
  return state.privateAllowed && !state.loading && !state.busy
    && !state.writePending && !state.searchPending && !state.refreshPending;
}
