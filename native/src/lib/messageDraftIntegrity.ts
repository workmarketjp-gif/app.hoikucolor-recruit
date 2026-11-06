/**
 * A canonical message send may complete while the candidate is typing their
 * next message. Never clear a newer local draft when an earlier body receives
 * its durable server acknowledgement and readback.
 */
export function draftAfterConfirmedMessageSend(
  currentDraft: string,
  submittedDraft: string,
): string {
  return currentDraft === submittedDraft ? '' : currentDraft;
}
