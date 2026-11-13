/**
 * Candidate message composer: an uncertain write must not be immediately sent
 * again from the same screen. The durable mutation adapter retains the request
 * id; this presentation gate only waits for a fresh canonical messages read.
 * Server authorization and idempotency remain in the existing RPC/adapter.
 */
export type CandidateMessageComposerGate = Readonly<{
  draft: string;
  busy: boolean;
  pending: boolean;
  needsReview: boolean;
}>;

export function canSubmitCandidateMessage(input: CandidateMessageComposerGate): boolean {
  return !input.busy && !input.pending && !input.needsReview && input.draft.trim().length > 0;
}

/** Only a started durable submission can have an ambiguous server write. */
export function shouldReviewCandidateMessageAfterFailure(requestStarted: boolean): boolean {
  return requestStarted;
}

/**
 * The screen captures the IDs visible BEFORE attempting a durable send. A
 * canonical reload can prove that the uncertain reply has arrived only when a
 * new message, from the candidate and with the exact submitted body, appears.
 * An older identical-body message is not evidence of the new send. The caller
 * must separately fence the read to the same owner, session and application.
 */
export function confirmedUncertainCandidateMessage(
  submittedDraft: string,
  knownMessageIds: readonly string[],
  freshlyReadMessages: readonly Readonly<{ id: string; sender_role: string; body: string }>[],
): boolean {
  const body = submittedDraft.trim();
  if (!body) return false;
  const known = new Set(knownMessageIds);
  return freshlyReadMessages.some((message) =>
    typeof message.id === 'string' && message.id.length > 0 &&
    !known.has(message.id) && message.sender_role === 'jobseeker' && message.body === body);
}

/**
 * A successful message-list read does not establish that an ambiguous write
 * failed. An empty list or an old identical-body message must never unlock
 * Send. Only positive canonical evidence can clear the pending-send warning.
 */
export function classifyUncertainCandidateMessageReview(
  pending: Readonly<{ submittedDraft: string; knownMessageIds: readonly string[] }> | null,
  freshlyReadMessages: readonly Readonly<{ id: string; sender_role: string; body: string }>[],
): 'none' | 'confirmed' | 'unverified' {
  if (!pending) return 'none';
  return confirmedUncertainCandidateMessage(pending.submittedDraft, pending.knownMessageIds, freshlyReadMessages)
    ? 'confirmed'
    : 'unverified';
}
