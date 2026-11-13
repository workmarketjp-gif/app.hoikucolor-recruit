import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

/**
 * Read a candidate profile with two independent presentation deadlines:
 * Clerk token acquisition and the canonical, read-only profile request.
 * Only the same live, verified candidate/session can launch or publish a read.
 * The deadline does not cancel the RPC and must never be used for profile writes.
 */
export async function readCandidateProfileBounded<TPinned extends { isCurrent: () => boolean }, TProfile>(options: {
  pin: () => Promise<TPinned | null>;
  load: (pinned: TPinned) => Promise<TProfile>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  timeoutMs?: number;
}): Promise<{ pinned: TPinned; profile: TProfile }> {
  const pinned = await pinCandidateForRead(options.pin, options.isCurrent, options.timeoutMs);
  const authorized = () => options.isCurrent() && pinned.isCurrent() && options.ownsPin(pinned);
  if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
  const profile = await boundedPrivateRead(() => {
    // The read is scheduled on a microtask: check again at network launch.
    if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
    return options.load(pinned);
  }, options.timeoutMs);
  if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
  return { pinned, profile };
}

// Only the token acquisition before an explicitly confirmed profile upsert is
// time-bounded. Never time out or automatically retry the profile mutation.
// Reuse the existing candidate pre-write pin policy, with its live lease checks.
export { pinForApplicationMutation as pinCandidateProfilePrewrite } from './applicationMutationPin.ts';

/**
 * Bound only the canonical confirmation READ after an attempted upsert.
 * A timeout is an *unknown write result*, never evidence to send the mutation
 * again. The screen retains its existing needsCanonicalReload quarantine.
 */
export async function readCandidateProfileAfterWrite<TPinned extends { isCurrent: () => boolean }, TProfile>(options: {
  pinned: TPinned;
  load: (pinned: TPinned) => Promise<TProfile>;
  isCurrent: () => boolean;
  timeoutMs?: number;
}): Promise<TProfile> {
  const assertCurrent = () => {
    if (!options.isCurrent() || !options.pinned.isCurrent()) {
      throw new Error('安全なログイン状態を確認できませんでした。');
    }
  };
  const profile = await boundedPrivateRead(() => {
    assertCurrent();
    return options.load(options.pinned);
  }, options.timeoutMs);
  assertCurrent();
  return profile;
}
