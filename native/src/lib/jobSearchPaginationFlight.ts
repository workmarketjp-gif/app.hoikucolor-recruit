export type JobSearchPaginationReadState = {
  ownerKey: string | null;
  currentOwnerKey: string | null;
  isPrivateVisible: boolean;
  isFocused: boolean;
  hasVerifiedPage: boolean;
  hasMore: boolean;
  currentGeneration: number;
  inFlightGeneration: number | null;
};

/**
 * Prevent two rapid taps from dispatching the same next-page RPC before React
 * has committed `loading=true`. The generation, rather than a stale loading
 * boolean, is the authority: an invalidated request cannot block new work.
 *
 * This is only a client-side request gate; canonical cursors, RLS and the
 * pinned-candidate read still determine what can be fetched and displayed.
 */
export function canStartJobSearchPaginationRead(state: JobSearchPaginationReadState): boolean {
  return Boolean(
    state.ownerKey && state.ownerKey === state.currentOwnerKey &&
    state.isPrivateVisible && state.isFocused && state.hasVerifiedPage && state.hasMore &&
    state.inFlightGeneration !== state.currentGeneration
  );
}
