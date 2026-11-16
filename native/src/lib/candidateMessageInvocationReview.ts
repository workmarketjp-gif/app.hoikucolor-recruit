/**
 * The RPC might complete after this screen blurs or starts a new canonical load.
 * Record an invoked message BEFORE awaiting its result: a stale completion must
 * never unlock another Send until the same candidate checks canonical messages.
 * This is only a screen-local presentation fence, not server idempotency.
 */
export type CandidateMessageInvocationReview = Readonly<{
  submittedDraft: string;
  knownMessageIds: readonly string[];
  ownerId: string;
  ownerSessionId: string;
  applicationId: string;
}>;

export function captureCandidateMessageInvocationReview(
  attempt: CandidateMessageInvocationReview,
): CandidateMessageInvocationReview {
  // The caller's list may be replaced during a focus refresh; keep the
  // pre-send identity snapshot independent from the current UI list.
  return { ...attempt, knownMessageIds: [...attempt.knownMessageIds] };
}

/** A ref is synchronous: React's needsReview state can lag after blur. */
export function candidateMessageSendNeedsReview(
  stateNeedsReview: boolean,
  invokedAttempt: CandidateMessageInvocationReview | null,
): boolean {
  return stateNeedsReview || invokedAttempt !== null;
}
