import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Apply a deadline ONLY to the pre-write Clerk session/token pin for a
 * candidate's application, interview, offer, document repair or message action.
 * The backend mutation itself must never be timed out or automatically retried:
 * its commit status can be ambiguous and needs canonical readback instead.
 * A late token cannot launch a write after timeout, blur, App Lock or logout.
 */
export async function pinForApplicationMutation<T extends { isCurrent: () => boolean }>(
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
