import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Give a user-initiated message send a presentation deadline without treating
 * timeout as a cancelled/failed RPC. The durable message adapter still owns
 * single-send, idempotency receipt, session fencing and canonical confirmation.
 *
 * The supplied lease MUST be included in the adapter's isCurrent callback:
 * if SecureStore preparation finishes after the deadline, NO new RPC may start;
 * if an RPC was already invoked, NO late canonical read or receipt clear may
 * run under a stale presentation. The caller handles invoked/uncertain state.
 */
export async function sendCandidateMessageWithinPresentationDeadline<T>(
  send: (presentationLeaseIsCurrent: () => boolean) => Promise<T>,
  isCurrent: () => boolean,
  timeoutMs?: number,
): Promise<T> {
  let presentationActive = true;
  const leaseIsCurrent = () => presentationActive && isCurrent();
  const assertCurrent = () => {
    if (!leaseIsCurrent()) throw new Error('安全なログイン状態を確認できませんでした。');
  };
  assertCurrent();
  try {
    const confirmed = await boundedPrivateRead(() => {
      assertCurrent();
      return send(leaseIsCurrent);
    }, timeoutMs);
    assertCurrent();
    return confirmed;
  } finally {
    presentationActive = false;
  }
}
