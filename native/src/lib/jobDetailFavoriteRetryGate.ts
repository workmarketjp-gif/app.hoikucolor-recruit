export type JobDetailFavoriteRetryState = {
  hasOwner: boolean;
  focused: boolean;
  jobVerified: boolean;
  pageLoading: boolean;
  savedIdsUnknown: boolean;
  readErrorPresent: boolean;
  mutationPending: boolean;
  retryPending: boolean;
};

/**
 * A failed saved-heart read can be retried separately from job/profile and
 * application reads. Never let an unknown saved state enable an edit or create
 * competing reads during a mutation; the pinned-candidate adapter remains the
 * authorization and canonical readback authority.
 */
export function canStartJobDetailFavoriteRetry(state: JobDetailFavoriteRetryState): boolean {
  return state.hasOwner && state.focused && state.jobVerified && !state.pageLoading &&
    state.savedIdsUnknown && state.readErrorPresent && !state.mutationPending && !state.retryPending;
}
