import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

/**
 * Read-only, deadline-bounded Spot application preflight. No application RPC or
 * durable marker is sent/created by this helper. A timed-out profile read may
 * still settle on the network: its late result is never used for submission.
 * The actual mutation remains outside of all read-only timeouts.
 */
export async function readSpotApplicationPreflight<
  TPinned extends { ownerId: string; isCurrent: () => boolean },
  TProfile extends { clerk_user_id: string },
>(options: {
  pin: () => Promise<TPinned | null>;
  readProfile: (pinned: TPinned) => Promise<TProfile | null>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  timeoutMs?: number;
}): Promise<{ pinned: TPinned; profile: TProfile | null }> {
  const pinned = await pinCandidateForRead(options.pin, options.isCurrent, options.timeoutMs);
  const authorized = () => options.isCurrent() && pinned.isCurrent() && options.ownsPin(pinned);
  if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
  const profile = await boundedPrivateRead(() => {
    if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
    return options.readProfile(pinned);
  }, options.timeoutMs);
  if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
  if (profile !== null && profile.clerk_user_id !== pinned.ownerId) {
    throw new Error('プロフィールの所有者を確認できませんでした。');
  }
  return { pinned, profile };
}
