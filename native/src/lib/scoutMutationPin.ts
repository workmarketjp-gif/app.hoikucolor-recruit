import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Bound ONLY the pre-mutation Clerk/session pin for a candidate's scout action.
 * The pin may hang before a write can start, leaving buttons busy forever.
 * The mutation itself is intentionally NOT bounded/retried: a timed-out write
 * may already have committed and must go through canonical readback/quarantine.
 *
 * A late pin result cannot start a write after timeout, focus loss, App Lock,
 * account switch, or a superseding operation. The caller must also check the
 * pinned owner/session against the requested candidate before the RPC.
 */
export async function pinForScoutMutation<T extends { isCurrent: () => boolean }>(
  pinCandidateAction: () => Promise<T | null>,
  isActionCurrent: () => boolean,
  timeoutMs?: number,
): Promise<T> {
  const assertCurrent = () => {
    if (!isActionCurrent()) {
      throw new Error('安全なログイン状態を確認できませんでした。');
    }
  };
  assertCurrent();
  const pinned = await boundedPrivateRead(() => {
    assertCurrent();
    return pinCandidateAction();
  }, timeoutMs);
  if (!pinned || !pinned.isCurrent() || !isActionCurrent()) {
    throw new Error('安全なログイン状態を確認できませんでした。');
  }
  return pinned;
}
