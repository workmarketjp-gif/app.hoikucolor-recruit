import { readCandidateJobDiscoveryBounded } from './jobDiscoveryCanonicalRead.ts';

/**
 * Resume review and PDF preflight must use a single authorized candidate for
 * the resume, shared profile, and preferences. Treat the three reads as one
 * snapshot: a missing, hung, or revoked source never yields a partial preview.
 * This is read-only; PDF generation, Storage writes and auto-save mutations
 * must never be put behind a retryable presentation deadline.
 */
export async function readResumeReviewSnapshotBounded<
  TPinned extends { isCurrent: () => boolean }, TResume, TProfile, TPreferences,
>(options: {
  pin: () => Promise<TPinned | null>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  readResume: (pinned: TPinned) => Promise<TResume>;
  readProfile: (pinned: TPinned) => Promise<TProfile>;
  readPreferences: (pinned: TPinned) => Promise<TPreferences>;
  timeoutMs?: number;
}): Promise<{ pinned: TPinned; resume: TResume; profile: TProfile; preferences: TPreferences }> {
  const { pinned, value } = await readCandidateJobDiscoveryBounded({
    pin: options.pin,
    isCurrent: options.isCurrent,
    ownsPin: options.ownsPin,
    timeoutMs: options.timeoutMs,
    read: async (candidate) => {
      const [resume, profile, preferences] = await Promise.all([
        options.readResume(candidate),
        options.readProfile(candidate),
        options.readPreferences(candidate),
      ]);
      return { resume, profile, preferences };
    },
  });
  return { pinned, ...value };
}
