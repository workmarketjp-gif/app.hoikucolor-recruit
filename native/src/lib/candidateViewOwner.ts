/**
 * In-memory, account-scoped presentation gate for candidate-private Native reads.
 * This does not authorize data access: server RLS and pinned-session clients do.
 * It prevents cached UI state from owner A being rendered for owner B while a
 * screen is mounted through Clerk account/session replacement or App Lock.
 */
export type CandidateOwnedView<T> = Readonly<{ ownerKey: string; value: T }>;

export function candidateViewOwnerKey(
  userId: string | null | undefined,
  sessionId: string | null | undefined,
): string | null {
  if (typeof userId !== 'string' || !userId.trim() ||
      typeof sessionId !== 'string' || !sessionId.trim()) return null;
  // A JSON tuple avoids ambiguous concatenation of user/session identifiers.
  return JSON.stringify([userId, sessionId]);
}

export function readCandidateOwnedView<T>(
  snapshot: CandidateOwnedView<T> | null,
  currentOwnerKey: string | null,
  privateDataAllowed: boolean,
): T | null {
  return privateDataAllowed && currentOwnerKey !== null &&
    snapshot?.ownerKey === currentOwnerKey ? snapshot.value : null;
}
