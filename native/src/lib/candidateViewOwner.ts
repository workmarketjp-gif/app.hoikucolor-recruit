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

/**
 * A mounted application document panel can outlive a route param change.
 * Its private snapshot is valid only for the exact candidate session AND
 * application being viewed, not merely for the same logged-in candidate.
 * This key is a display fence; canonical backend ownership/RLS remains required.
 */
export function candidateApplicationViewOwnerKey(
  ownerKey: string | null | undefined,
  applicationId: string | null | undefined,
): string | null {
  if (typeof ownerKey !== 'string' || !ownerKey ||
      typeof applicationId !== 'string' || !applicationId.trim()) return null;
  return JSON.stringify([ownerKey, applicationId]);
}

export function readCandidateOwnedView<T>(
  snapshot: CandidateOwnedView<T> | null,
  currentOwnerKey: string | null,
  privateDataAllowed: boolean,
): T | null {
  return privateDataAllowed && currentOwnerKey !== null &&
    snapshot?.ownerKey === currentOwnerKey ? snapshot.value : null;
}

/**
 * After App Lock/unlock, an old snapshot with the same user and session still
 * needs a NEW canonical read. A matching owner key alone is insufficient.
 */
export function readCandidateFreshlyVerifiedView<T>(
  snapshot: CandidateOwnedView<T> | null,
  currentOwnerKey: string | null,
  privateDataAllowed: boolean,
  freshlyVerifiedOwnerKey: string | null,
): T | null {
  return readCandidateOwnedView(
    snapshot,
    currentOwnerKey,
    privateDataAllowed && freshlyVerifiedOwnerKey !== null &&
      freshlyVerifiedOwnerKey === currentOwnerKey,
  );
}
