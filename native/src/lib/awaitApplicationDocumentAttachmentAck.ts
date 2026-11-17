/**
 * Bounds the *presentation wait* for one application-document attachment.
 * It does not abort a request that has already started, nor assert that the
 * server did not commit. The caller must quarantine ambiguous writes and do
 * canonical readback before representing a document as submitted.
 *
 * Each stage of the adapter MUST check canContinue before launching another
 * RPC/Storage operation. Once the deadline or presentation lease is lost, an
 * already-started request may settle, but no later stage may begin.
 */
export const DEFAULT_ATTACHMENT_ACK_TIMEOUT_MS = 15_000;

export async function awaitApplicationDocumentAttachmentAck<T>(
  invoke: (canContinue: () => boolean) => Promise<T>,
  isCurrent: () => boolean,
  timeoutMs = DEFAULT_ATTACHMENT_ACK_TIMEOUT_MS,
): Promise<T> {
  let presentationActive = true;
  const canContinue = () => presentationActive && isCurrent();
  const assertCurrent = () => {
    if (!canContinue()) throw new Error('応募書類の操作画面が変更されました。提出結果を再確認してください。');
  };
  assertCurrent();
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.max(1, Math.floor(timeoutMs))
    : DEFAULT_ATTACHMENT_ACK_TIMEOUT_MS;

  try {
    return await new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        // Ambiguous by design: a request may already have reached Supabase.
        reject(new Error('応募書類の提出結果を確認できませんでした。最新の提出状況を再確認してください。'));
      }, duration);
      Promise.resolve().then(() => {
        assertCurrent(); // screen may be revoked before the microtask runs
        return invoke(canContinue);
      }).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { assertCurrent(); resolve(value); }
          catch (error) { reject(error); }
        },
        (error: unknown) => {
          if (settled) return; // observe late rejections; never retry
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  } finally {
    presentationActive = false;
  }
}
