import { readCandidateJobDiscoveryBounded } from './jobDiscoveryCanonicalRead.ts';

/**
 * Read one comparison snapshot under the same pinned Clerk candidate session.
 * Either all three canonical sources are verified or no snapshot is returned.
 * Both token acquisition and the combined read have finite presentation deadlines;
 * an expired read is never retried or presented as an empty catalog.
 */
export async function readCandidateComparisonBounded<
  TPinned extends { isCurrent: () => boolean }, TJobs, TProfile, TPreferences,
>(options: {
  pin: () => Promise<TPinned | null>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  readJobs: (pinned: TPinned) => Promise<TJobs>;
  readProfile: (pinned: TPinned) => Promise<TProfile>;
  readPreferences: (pinned: TPinned) => Promise<TPreferences>;
  timeoutMs?: number;
}): Promise<{ pinned: TPinned; jobs: TJobs; profile: TProfile; preferences: TPreferences }> {
  const { pinned, value } = await readCandidateJobDiscoveryBounded({
    pin: options.pin,
    isCurrent: options.isCurrent,
    ownsPin: options.ownsPin,
    timeoutMs: options.timeoutMs,
    read: async (pinned) => {
      const [jobs, profile, preferences] = await Promise.all([
        options.readJobs(pinned),
        options.readProfile(pinned),
        options.readPreferences(pinned),
      ]);
      return { jobs, profile, preferences };
    },
  });
  return { pinned, ...value };
}
