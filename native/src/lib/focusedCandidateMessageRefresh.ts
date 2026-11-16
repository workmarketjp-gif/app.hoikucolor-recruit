/**
 * A candidate's opened application thread should match the Web's foreground
 * refresh cadence without polling a hidden screen or mutating an ambiguous
 * send. Both before the read and after its await, the caller must enforce
 * these guards alongside its exact Clerk/session and route generation lease.
 */
export type FocusedCandidateMessageRefreshState = Readonly<{
  focused: boolean;
  foreground: boolean;
  initialLoadComplete: boolean;
  mutationRevisionCurrent: boolean;
  mutationPending: boolean;
  sendNeedsReview: boolean;
}>;

export function canRefreshFocusedCandidateMessages(
  state: FocusedCandidateMessageRefreshState,
  refreshAlreadyPending: boolean,
): boolean {
  return !refreshAlreadyPending && canApplyFocusedCandidateMessageRefresh(state);
}

/** Never apply a late canonical response over a new write, review, or owner. */
export function canApplyFocusedCandidateMessageRefresh(
  state: FocusedCandidateMessageRefreshState,
): boolean {
  return state.focused && state.foreground && state.initialLoadComplete && state.mutationRevisionCurrent &&
    !state.mutationPending && !state.sendNeedsReview;
}
