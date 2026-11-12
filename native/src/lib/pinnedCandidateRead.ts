import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Bound the Clerk token/session pin preceding a candidate-private *read*.
 * A pending getToken() can otherwise leave the screen at a spinner forever,
 * even when every subsequent canonical RPC has its own deadline.
 *
 * The pinned session and screen's latest generation must both still be valid
 * before the caller starts any candidate-private RPC. A presentation deadline
 * does not cancel the underlying token request or confer authorization.
 * Never wrap mutations (message/application/offer sends) in this helper.
 */
export async function pinCandidateForRead<T extends { isCurrent: () => boolean }>(
  pinCandidateAction: () => Promise<T | null>,
  isScreenCurrent: () => boolean,
  timeoutMs?: number,
): Promise<T> {
  // A lost screen lease is not permission to request a fresh Clerk token.
  // The bounded helper schedules its read on a microtask, so check BOTH now
  // and at the actual token-request launch. Late token resolution remains
  // fenced by the existing final session/generation check below.
  const assertScreenCurrent = () => {
    if (!isScreenCurrent()) {
      throw new Error('安全なログイン状態を確認できませんでした。');
    }
  };
  assertScreenCurrent();
  const pinned = await boundedPrivateRead(() => {
    assertScreenCurrent();
    return pinCandidateAction();
  }, timeoutMs);
  if (!pinned || !isScreenCurrent() || !pinned.isCurrent()) {
    throw new Error('安全なログイン状態を確認できませんでした。');
  }
  return pinned;
}
