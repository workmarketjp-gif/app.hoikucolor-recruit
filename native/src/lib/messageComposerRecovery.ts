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
