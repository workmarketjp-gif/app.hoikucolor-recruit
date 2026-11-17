import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Give a Scout write acknowledgement a finite UI deadline without cancelling
 * the underlying mutation or automatically submitting a second request.
 * The caller MUST treat every rejection (including timeout) as an UNKNOWN
 * mutation outcome, hide stale actions and demand a new canonical read.
 *
 * In particular, this is NOT evidence that the server failed to commit.
 * Delayed success/rejection is observed by boundedPrivateRead, but cannot be
 * published as a successful mutation after this deadline.
 */
export async function boundedScoutMutationAcknowledgement<T>(
  sendOnce: () => Promise<T>,
  isCurrent: () => boolean,
  timeoutMs?: number,
): Promise<T> {
  const requireCurrent = () => {
    if (!isCurrent()) throw new Error('安全なログイン状態を確認できませんでした。');
  };
  requireCurrent();
  const acknowledged = await boundedPrivateRead(() => {
    requireCurrent();
    return sendOnce();
  }, timeoutMs);
  requireCurrent();
  return acknowledged;
}
