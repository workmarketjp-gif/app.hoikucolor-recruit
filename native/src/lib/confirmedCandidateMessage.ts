/**
 * Present the reply returned by the existing durable adapter's *canonical*
 * readback. No second screen-wide load is needed to make a verified message
 * visible; an unrelated document-handoff failure must not hide the thread.
 * This function does not grant message access or perform any network mutation.
 */
export type ConfirmedCandidateMessage = Readonly<{
  id: string;
  sender_role: string;
  body: string;
}>;

export function mergeConfirmedCandidateMessage<T extends ConfirmedCandidateMessage>(
  visibleMessages: readonly T[],
  confirmed: T,
  submittedDraft: string,
): T[] {
  if (
    !confirmed.id.trim() ||
    confirmed.sender_role !== 'jobseeker' ||
    confirmed.body !== submittedDraft.trim()
  ) {
    throw new Error('送信したメッセージの確認結果が一致しません。');
  }
  // Identity, not body or timestamp, defines one canonical reply. An existing
  // row is replaced from readback; a second identical-body reply is not hidden.
  const existingIndex = visibleMessages.findIndex((message) => message.id === confirmed.id);
  if (existingIndex === -1) return [...visibleMessages, confirmed];
  return visibleMessages.map((message, index) => index === existingIndex ? confirmed : message);
}
