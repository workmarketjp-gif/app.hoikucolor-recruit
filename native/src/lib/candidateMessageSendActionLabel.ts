/**
 * The durable message adapter marks an invoked RPC as reviewable before its
 * acknowledgement. That provisional safety flag must not change an in-flight
 * send button to 「確認中…」 or falsely present a blocked, uncertain send as an
 * enabled 「送信する」 action. The actual enabled/disabled policy remains in
 * messageComposerRecovery and the canonical backend remains authoritative.
 */
export type CandidateMessageActionPresentation = Readonly<{
  busy: boolean;
  sendPending: boolean;
  needsReview: boolean;
}>;

export function candidateMessageSendActionLabel(state: CandidateMessageActionPresentation): string {
  if (state.sendPending) return '送信中…';
  if (state.needsReview) return state.busy ? '確認中…' : '送信結果を確認';
  return state.busy ? '処理中…' : '送信する';
}
