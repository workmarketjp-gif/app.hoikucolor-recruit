import { clearAllDurableMutations } from './durableMutation';
import { purgePendingDocumentPickerCache } from './documentPickerCache';
import { clearOfflineSavedJobs } from './offlineSavedJobs';
import { clearOfflineSavedSnapshot } from './offlineSavedSnapshot';
import { withCandidateLocalStatePurge } from './candidateLocalStateSession';

export const CANDIDATE_LOCAL_PRIVACY_PURGE_INCOMPLETE = 'CANDIDATE_LOCAL_PRIVACY_PURGE_INCOMPLETE';

type PurgeFailure = {
  surface: string;
  message: string;
};

function normalizeOwnerId(userId: string) {
  const ownerId = userId.trim();
  if (!ownerId) throw new Error('AUTH_REQUIRED');
  return ownerId;
}

function errorMessage(error: unknown) {
  return String((error as { message?: unknown } | null)?.message ?? error ?? 'UNKNOWN_ERROR');
}

/**
 * Removes Candidate-private local state before an explicit Clerk sign-out or
 * terminal account-deletion handoff.
 *
 * All surfaces are attempted even when one fails, but unlike Promise.allSettled
 * callers from older shells, any failed physical deletion is surfaced to the
 * caller. Sign-out must therefore fail closed instead of silently leaving saved
 * job state, recovery envelopes or a picker-created document cache on a shared
 * device.
 */
export async function purgeCandidatePrivateLocalState(userId: string) {
  const ownerId = normalizeOwnerId(userId);

  // Mark the owner as purging before the first await, drain any Candidate-local
  // saved-state write already inside the per-user queue, then perform physical
  // deletion while holding that same queue. A stale async continuation from the
  // previous Clerk session therefore cannot recreate saved queue/snapshot data
  // after a completed auth-boundary purge.
  return withCandidateLocalStatePurge(ownerId, async () => {
    const operations = [
      ['saved-command-queue', () => clearOfflineSavedJobs(ownerId)],
      ['saved-display-snapshot', () => clearOfflineSavedSnapshot(ownerId)],
      ['durable-mutation-recovery', () => clearAllDurableMutations(ownerId)],
      ['document-picker-cache', () => purgePendingDocumentPickerCache()],
    ] as const;

    const results = await Promise.allSettled(operations.map(([, operation]) => operation()));
    const failures: PurgeFailure[] = [];

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.status === 'fulfilled') continue;
      failures.push({
        surface: operations[index][0],
        message: errorMessage(result.reason),
      });
    }

    if (failures.length > 0) {
      const error = new Error(
        `${CANDIDATE_LOCAL_PRIVACY_PURGE_INCOMPLETE}:${failures.map((item) => item.surface).join(',')}`,
      ) as Error & { failures?: PurgeFailure[] };
      error.failures = failures;
      throw error;
    }

    return { ownerId, clearedSurfaces: operations.length } as const;
  });
}

export function isCandidateLocalPrivacyPurgeError(error: unknown) {
  return errorMessage(error).includes(CANDIDATE_LOCAL_PRIVACY_PURGE_INCOMPLETE);
}
