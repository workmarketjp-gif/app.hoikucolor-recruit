import * as SecureStore from 'expo-secure-store';
import {
  type CandidateLocalStateSessionLease,
  withCandidateLocalStateWrite,
} from './candidateLocalStateSession';

export type OfflineSavedJobCommand = {
  jobId: string;
  saved: boolean;
};

const PREFIX = 'hc_color_saved_queue_v1_';
export const MAX_OFFLINE_SAVED_JOB_COMMANDS = 20;

function safeUserKey(userId: string) {
  if (!userId) throw new Error('AUTH_REQUIRED');
  const normalized = userId.replace(/[^A-Za-z0-9._-]/g, '_');
  return `${PREFIX}${normalized}`;
}

function normalize(raw: unknown): OfflineSavedJobCommand[] {
  if (!Array.isArray(raw)) return [];
  const byJob = new Map<string, OfflineSavedJobCommand>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const jobId = String((item as { jobId?: unknown }).jobId || '').trim();
    const saved = (item as { saved?: unknown }).saved;
    if (!jobId || typeof saved !== 'boolean') continue;
    byJob.set(jobId, { jobId, saved });
  }
  return [...byJob.values()].slice(-MAX_OFFLINE_SAVED_JOB_COMMANDS);
}

export function compactSavedJobQueue(
  current: OfflineSavedJobCommand[],
  next: OfflineSavedJobCommand,
): OfflineSavedJobCommand[] {
  const queue = normalize(current).filter((item) => item.jobId !== next.jobId);
  if (queue.length >= MAX_OFFLINE_SAVED_JOB_COMMANDS) {
    throw new Error('OFFLINE_SAVED_JOB_QUEUE_FULL');
  }
  queue.push({ jobId: next.jobId, saved: Boolean(next.saved) });
  return queue;
}

export async function loadOfflineSavedJobQueue(
  userId: string,
): Promise<OfflineSavedJobCommand[]> {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('SECURE_STORE_UNAVAILABLE');
  }
  const raw = await SecureStore.getItemAsync(safeUserKey(userId));
  if (!raw) return [];
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function queueOfflineSavedJob(
  userId: string,
  command: OfflineSavedJobCommand,
  lease: CandidateLocalStateSessionLease,
) {
  if (lease.userId !== userId) throw new Error('CANDIDATE_LOCAL_STATE_OWNER_MISMATCH');
  return withCandidateLocalStateWrite(lease, async () => {
    const current = await loadOfflineSavedJobQueue(userId);
    const next = compactSavedJobQueue(current, command);
    await SecureStore.setItemAsync(safeUserKey(userId), JSON.stringify(next));
    return next;
  });
}

export async function removeOfflineSavedJob(
  userId: string,
  jobId: string,
  lease: CandidateLocalStateSessionLease,
) {
  if (lease.userId !== userId) throw new Error('CANDIDATE_LOCAL_STATE_OWNER_MISMATCH');
  return withCandidateLocalStateWrite(lease, async () => {
    const current = await loadOfflineSavedJobQueue(userId);
    const next = current.filter((item) => item.jobId !== jobId);
    if (next.length) {
      await SecureStore.setItemAsync(safeUserKey(userId), JSON.stringify(next));
    } else {
      await SecureStore.deleteItemAsync(safeUserKey(userId));
    }
    return next;
  });
}

export async function clearOfflineSavedJobs(userId: string) {
  await SecureStore.deleteItemAsync(safeUserKey(userId));
}

export function isNetworkLikeError(error: unknown) {
  const message = String(
    (error as { message?: unknown } | null)?.message ?? error ?? '',
  ).toLowerCase();
  return /network|fetch|offline|timeout|connection|socket|failed to fetch/.test(
    message,
  );
}
