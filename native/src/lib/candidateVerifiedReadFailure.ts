/**
 * Candidate-private rows may remain visible after a failed manual refresh
 * only if the SAME candidate/Clerk-session was independently pinned again.
 * A failed/expired Clerk token is not proof of continued authorization.
 * This is a presentation gate; canonical list reads and server RLS remain
 * authoritative. It must never be used to authorize writes.
 */
export function canRetainCandidateRowsAfterFailedRead(state: Readonly<{
  retainedAtStart: boolean;
  expectedOwnerKey: string | null;
  pinnedOwnerKey: string | null;
  pinnedSessionCurrent: boolean;
  privateAllowed: boolean;
}>): boolean {
  return state.retainedAtStart && state.privateAllowed &&
    !!state.expectedOwnerKey && state.pinnedOwnerKey === state.expectedOwnerKey &&
    state.pinnedSessionCurrent;
}
