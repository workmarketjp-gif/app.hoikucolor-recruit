import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Give an explicit job application one bounded UI wait without treating timeout
 * as cancellation or proof of failed submission. The durable pre-submit marker
 * must remain until a fresh candidate-owned canonical read confirms the result.
 *
 * The callback MUST pass the supplied lease into its post-RPC adapter. Once a
 * deadline, session change, App Lock or screen leave ends this presentation,
 * a late RPC acknowledgement must not start more private reads or document
 * attachments. The original server mutation may already have committed.
 */
export async function submitApplicationWithinPresentationDeadline<T>(
  submit: (presentationLeaseIsCurrent: () => boolean) => Promise<T>,
  isCurrent: () => boolean,
  timeoutMs?: number,
): Promise<T> {
  let presentationActive = true;
  const leaseIsCurrent = () => presentationActive && isCurrent();
  const assertCurrent = () => {
    if (!leaseIsCurrent()) {
      throw new Error('安全なログイン状態を確認できませんでした。応募状況を再確認してください。');
    }
  };
  assertCurrent();
  try {
    const confirmed = await boundedPrivateRead(() => {
      assertCurrent();
      return submit(leaseIsCurrent);
    }, timeoutMs);
    assertCurrent();
    return confirmed;
  } finally {
    // Even if the RPC settles after timeout, no further private read or
    // attachment may launch under the expired presentation lease.
    presentationActive = false;
  }
}
