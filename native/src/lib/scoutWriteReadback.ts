import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Require a current, candidate-owned canonical snapshot after an acknowledged
 * Scout mutation. A hung *readback* has a presentation deadline, unlike the
 * mutation RPC itself: writes are never retried and an uncertain outcome must
 * remain quarantined by the caller until a new canonical read.
 *
 * This helper neither issues writes nor makes an RPC acknowledgement proof of
 * persistence. Late resolved/rejected reads are observed by boundedPrivateRead
 * and cannot validate a stale account or publish a success notice.
 */
export async function confirmedScoutWriteReadback<TSnapshot, TConfirmed>(
  read: () => Promise<TSnapshot>,
  verify: (snapshot: TSnapshot) => TConfirmed,
  isCurrent: () => boolean,
  timeoutMs?: number,
): Promise<TConfirmed> {
  const requireCurrent = () => {
    if (!isCurrent()) {
      throw new Error('安全なログイン状態を確認できませんでした。');
    }
  };
  requireCurrent();
  const snapshot = await boundedPrivateRead(() => {
    requireCurrent();
    return read();
  }, timeoutMs);
  requireCurrent();
  const result = verify(snapshot);
  requireCurrent();
  return result;
}
