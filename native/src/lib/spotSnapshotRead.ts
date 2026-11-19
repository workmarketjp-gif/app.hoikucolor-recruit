import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

/**
 * The candidate's open spots and private confirmed assignments form one
 * publishable snapshot. Bound both the Clerk token pin and canonical RPCs.
 * Never turn a missing, timed-out or partially failed snapshot into empty jobs.
 * A deadline stops presentation only; it does not cancel remote requests.
 */
export async function readCandidateSpotSnapshotBounded<
  TPinned extends { isCurrent: () => boolean },
  TJobs,
  TAssignments,
>(options: {
  pin: () => Promise<TPinned | null>;
  readJobs: (pinned: TPinned) => Promise<TJobs>;
  readAssignments: (pinned: TPinned) => Promise<TAssignments>;
  isCurrent: () => boolean;
  ownsPin: (pinned: TPinned) => boolean;
  timeoutMs?: number;
}): Promise<{ jobs: TJobs; assignments: TAssignments }> {
  const pinned = await pinCandidateForRead(options.pin, options.isCurrent, options.timeoutMs);
  const authorized = () => options.isCurrent() && pinned.isCurrent() && options.ownsPin(pinned);
  if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
  const [jobs, assignments] = await boundedPrivateRead(() => {
    // Screen blur/session switch between the pin and queued RPC must block both reads.
    if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
    return Promise.all([options.readJobs(pinned), options.readAssignments(pinned)]);
  }, options.timeoutMs);
  if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');
  return { jobs, assignments };
}
