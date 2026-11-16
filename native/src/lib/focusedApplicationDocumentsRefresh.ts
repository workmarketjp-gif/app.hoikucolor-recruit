/**
 * Match the Web's 60-second open-panel document refresh without polling a
 * hidden jobseeker vault or racing a candidate document mutation. Caller
 * also checks the pinned Clerk owner/session and request generation.
 */
export type FocusedApplicationDocumentsRefreshState = Readonly<{
  open: boolean;
  focused: boolean;
  foreground: boolean;
  privateAccess: boolean;
  ownerCurrent: boolean;
  mutationPending: boolean;
}>;

export function canStartFocusedApplicationDocumentsRefresh(
  state: FocusedApplicationDocumentsRefreshState,
  readPending: boolean,
): boolean {
  return !readPending && canApplyFocusedApplicationDocumentsRefresh(state);
}

/** Revalidate after each await; a backgrounded/closed panel cannot reveal rows. */
export function canApplyFocusedApplicationDocumentsRefresh(
  state: FocusedApplicationDocumentsRefreshState,
): boolean {
  return state.open && state.focused && state.foreground &&
    state.privateAccess && state.ownerCurrent && !state.mutationPending;
}

/** Let a started attachment settle before releasing its duplicate-write lock. */
export function shouldRevokeDocumentReadOnBlur(mutationPending: boolean): boolean {
  return !mutationPending;
}

/** Publish private attachment handoff only to the still-focused owning route. */
export function canPublishApplicationDocumentHandoff(
  state: FocusedApplicationDocumentsRefreshState & Readonly<{ presentationUnchanged: boolean }>,
  requestCurrent: boolean,
): boolean {
  return requestCurrent && state.presentationUnchanged &&
    state.open && state.focused && state.foreground &&
    state.privateAccess && state.ownerCurrent && state.mutationPending;
}

/** A private signed URL may reach the OS only during a current presentation lease. */
export function canOpenAttachedApplicationDocumentUrl(
  state: FocusedApplicationDocumentsRefreshState & Readonly<{ presentationUnchanged: boolean }>,
  requestCurrent: boolean,
): boolean {
  return canPublishApplicationDocumentHandoff(state, requestCurrent);
}
