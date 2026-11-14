import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

/**
 * Bound job discovery reads (search pages, bookmark IDs and filter facets).
 * A hung Clerk token or canonical RPC must surface an error, not an endless
 * spinner or an invented empty result. These deadlines do not cancel the
 * underlying read, change authorization or retry any mutation.
 */
export async function readCandidateJobDiscoveryBounded<TPinned extends { isCurrent: () => boolean }, TValue>(options: {
  pin: () => Promise<TPinned | null>;
  read: (pinned: TPinned) => Promise<TValue>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  timeoutMs?: number;
}): Promise<{ pinned: TPinned; value: TValue }> {
  const pinned = await pinCandidateForRead(options.pin, options.isCurrent, options.timeoutMs);
  const authorize = () => options.isCurrent() && pinned.isCurrent() && options.ownsPin(pinned);
  if (!authorize()) throw new Error('安全なログイン状態を確認できませんでした。');
  const value = await boundedPrivateRead(() => {
    // Recheck after the microtask boundary and immediately before network I/O.
    if (!authorize()) throw new Error('安全なログイン状態を確認できませんでした。');
    return options.read(pinned);
  }, options.timeoutMs);
  if (!authorize()) throw new Error('安全なログイン状態を確認できませんでした。');
  return { pinned, value };
}
