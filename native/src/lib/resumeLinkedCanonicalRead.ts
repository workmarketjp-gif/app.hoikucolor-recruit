import { readCandidateJobDiscoveryBounded } from './jobDiscoveryCanonicalRead.ts';

/**
 * The résumé wizard's shared profile and childcare preferences must be
 * loaded together for one authorized Clerk candidate/session. Token acquisition
 * and the read-only canonical requests have separate presentation deadlines.
 * A missing/revoked source never yields a partial editable profile.
 * This function cannot save, retry or mutate candidate data.
 */
export async function readResumeLinkedProfileSnapshotBounded<
  TPinned extends { isCurrent: () => boolean }, TProfile, TPreferences,
>(options: {
  pin: () => Promise<TPinned | null>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  readProfile: (pinned: TPinned) => Promise<TProfile>;
  readPreferences: (pinned: TPinned) => Promise<TPreferences>;
  timeoutMs?: number;
}): Promise<{ pinned: TPinned; profile: TProfile; preferences: TPreferences }> {
  const { pinned, value } = await readCandidateJobDiscoveryBounded({
    pin: options.pin,
    isCurrent: options.isCurrent,
    ownsPin: options.ownsPin,
    timeoutMs: options.timeoutMs,
    read: async (candidate) => {
      const [profile, preferences] = await Promise.all([
        options.readProfile(candidate),
        options.readPreferences(candidate),
      ]);
      return { profile, preferences };
    },
  });
  return { pinned, ...value };
}
