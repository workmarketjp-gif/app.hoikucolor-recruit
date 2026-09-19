export type CandidateLocalStateSessionLease = {
  userId: string;
  sessionId: string;
  generation: number;
};

const sessionGenerations = new Map<string, number>();
const blockedSessions = new Set<string>();
const purgeDepthByUser = new Map<string, number>();
const userQueues = new Map<string, Promise<void>>();

function normalize(value: string, label: string) {
  const next = value.trim();
  if (!next) throw new Error(label);
  return next;
}

function sessionKey(userId: string, sessionId: string) {
  return `${normalize(userId, 'AUTH_REQUIRED')}:${normalize(sessionId, 'SESSION_REQUIRED')}`;
}

function currentGeneration(userId: string, sessionId: string) {
  return sessionGenerations.get(sessionKey(userId, sessionId)) ?? 0;
}

function purgeDepth(userId: string) {
  return purgeDepthByUser.get(userId) ?? 0;
}

function assertLease(lease: CandidateLocalStateSessionLease) {
  const key = sessionKey(lease.userId, lease.sessionId);
  if (
    purgeDepth(lease.userId) > 0 ||
    blockedSessions.has(key) ||
    currentGeneration(lease.userId, lease.sessionId) !== lease.generation
  ) {
    throw new Error('CANDIDATE_LOCAL_STATE_SESSION_CHANGED');
  }
}

async function withUserQueue<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const ownerId = normalize(userId, 'AUTH_REQUIRED');
  const previous = userQueues.get(ownerId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  userQueues.set(ownerId, tail);

  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (userQueues.get(ownerId) === tail) userQueues.delete(ownerId);
  }
}

export function captureCandidateLocalStateSessionLease(
  userId: string,
  sessionId: string,
): CandidateLocalStateSessionLease {
  const ownerId = normalize(userId, 'AUTH_REQUIRED');
  const ownerSessionId = normalize(sessionId, 'SESSION_REQUIRED');
  const key = sessionKey(ownerId, ownerSessionId);
  if (blockedSessions.has(key) || purgeDepth(ownerId) > 0) {
    throw new Error('CANDIDATE_LOCAL_STATE_SESSION_BLOCKED');
  }
  return {
    userId: ownerId,
    sessionId: ownerSessionId,
    generation: currentGeneration(ownerId, ownerSessionId),
  };
}

export function blockCandidateLocalStateSession(userId: string, sessionId: string) {
  const ownerId = normalize(userId, 'AUTH_REQUIRED');
  const ownerSessionId = normalize(sessionId, 'SESSION_REQUIRED');
  const key = sessionKey(ownerId, ownerSessionId);
  if (blockedSessions.has(key)) return;
  blockedSessions.add(key);
  sessionGenerations.set(key, currentGeneration(ownerId, ownerSessionId) + 1);
}

export function unblockCandidateLocalStateSession(userId: string, sessionId: string) {
  blockedSessions.delete(sessionKey(userId, sessionId));
}

/**
 * Serialize Candidate-private device writes for one owner and bind them to the
 * exact Clerk session that launched the write. A session handoff invalidates the
 * lease synchronously; the following privacy purge then waits for any write that
 * already crossed into native storage and deletes it before the next candidate
 * can mount.
 */
export async function withCandidateLocalStateWrite<T>(
  lease: CandidateLocalStateSessionLease,
  action: () => Promise<T>,
): Promise<T> {
  return withUserQueue(lease.userId, async () => {
    assertLease(lease);
    const result = await action();
    assertLease(lease);
    return result;
  });
}

/**
 * Block all new Candidate-private writes for an owner before the first await,
 * drain writes already inside the user queue, then run the physical purge while
 * still holding that same queue. Nested/concurrent purge callers are counted so
 * writes remain blocked until every purge boundary has completed.
 */
export async function withCandidateLocalStatePurge<T>(
  userId: string,
  action: () => Promise<T>,
): Promise<T> {
  const ownerId = normalize(userId, 'AUTH_REQUIRED');
  purgeDepthByUser.set(ownerId, purgeDepth(ownerId) + 1);
  try {
    return await withUserQueue(ownerId, action);
  } finally {
    const next = purgeDepth(ownerId) - 1;
    if (next > 0) purgeDepthByUser.set(ownerId, next);
    else purgeDepthByUser.delete(ownerId);
  }
}
