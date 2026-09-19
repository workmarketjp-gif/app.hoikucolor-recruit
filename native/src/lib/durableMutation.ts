import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

export type DurableMutationKind = 'message' | 'visit' | 'interview';

export type DurableMutationEnvelope = {
  version: 1;
  kind: DurableMutationKind;
  scopeId: string;
  requestId: string;
  payloadHash: string;
  createdAt: string;
};

type DurableMutationIndex = {
  version: 1;
  keys: string[];
};

const PREFIX = 'hc.native.ambiguous-mutation.v1';
const INDEX_PREFIX = 'hc.native.ambiguous-mutation-index.v1';
const MAX_TRACKED_KEYS = 128;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DURABLE_MUTATION_PAYLOAD_MISMATCH = 'MUTATION_RECOVERY_PAYLOAD_MISMATCH';

// SecureStore has no key-enumeration API. Keep a bounded, user-scoped registry of
// opaque envelope keys so account deletion can purge every process-death recovery
// record without persisting message/visit/interview plaintext.
const indexQueues = new Map<string, Promise<void>>();

// A durable recovery envelope is candidate-private local state.  A sign-out,
// account-deletion boundary, or Clerk session replacement must synchronously
// stop the old session from creating any new envelope before asynchronous
// SecureStore cleanup begins.  Otherwise a stale async continuation can recreate
// a recovery record after purge has completed.
const durableSessionGenerations = new Map<string, number>();
const blockedDurableSessions = new Set<string>();
const purgingUsers = new Set<string>();

export type DurableMutationSessionLease = {
  userId: string;
  sessionId: string;
  generation: number;
};

function durableSessionKey(userId: string, sessionId: string) {
  if (!userId || !sessionId) throw new Error('AUTH_REQUIRED');
  return `${safeSegment(userId)}:${safeSegment(sessionId)}`;
}

function currentDurableSessionGeneration(userId: string, sessionId: string) {
  return durableSessionGenerations.get(durableSessionKey(userId, sessionId)) ?? 0;
}

export function captureDurableMutationSessionLease(
  userId: string,
  sessionId: string,
): DurableMutationSessionLease {
  const key = durableSessionKey(userId, sessionId);
  if (blockedDurableSessions.has(key) || purgingUsers.has(userId)) {
    throw new Error('DURABLE_MUTATION_SESSION_BLOCKED');
  }
  return { userId, sessionId, generation: currentDurableSessionGeneration(userId, sessionId) };
}

export function blockDurableMutationSession(userId: string, sessionId: string) {
  const key = durableSessionKey(userId, sessionId);
  if (blockedDurableSessions.has(key)) return;
  blockedDurableSessions.add(key);
  durableSessionGenerations.set(key, currentDurableSessionGeneration(userId, sessionId) + 1);
}

export function unblockDurableMutationSession(userId: string, sessionId: string) {
  blockedDurableSessions.delete(durableSessionKey(userId, sessionId));
}

function assertDurableMutationLease(lease: DurableMutationSessionLease) {
  const key = durableSessionKey(lease.userId, lease.sessionId);
  if (
    purgingUsers.has(lease.userId) ||
    blockedDurableSessions.has(key) ||
    currentDurableSessionGeneration(lease.userId, lease.sessionId) !== lease.generation
  ) {
    throw new Error('DURABLE_MUTATION_SESSION_CHANGED');
  }
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function userPrefix(userId: string) {
  if (!userId) throw new Error('AUTH_REQUIRED');
  return `${PREFIX}:${safeSegment(userId)}:`;
}

function indexKey(userId: string) {
  if (!userId) throw new Error('AUTH_REQUIRED');
  return `${INDEX_PREFIX}:${safeSegment(userId)}`;
}

function storageKey(userId: string, kind: DurableMutationKind, scopeId: string) {
  if (!scopeId) throw new Error('MUTATION_SCOPE_REQUIRED');
  return `${userPrefix(userId)}${kind}:${safeSegment(scopeId)}`;
}

function isEnvelope(value: unknown): value is DurableMutationEnvelope {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.version === 1 &&
    (row.kind === 'message' || row.kind === 'visit' || row.kind === 'interview') &&
    typeof row.scopeId === 'string' &&
    typeof row.requestId === 'string' &&
    typeof row.payloadHash === 'string' &&
    typeof row.createdAt === 'string'
  );
}

function isIndex(value: unknown): value is DurableMutationIndex {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.version === 1 &&
    Array.isArray(row.keys) &&
    row.keys.every((key) => typeof key === 'string')
  );
}

async function withIndexQueue<T>(userId: string, action: () => Promise<T>): Promise<T> {
  const queueKey = indexKey(userId);
  const previous = indexQueues.get(queueKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => gate);
  indexQueues.set(queueKey, tail);

  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (indexQueues.get(queueKey) === tail) indexQueues.delete(queueKey);
  }
}

async function readTrackedKeysUnlocked(userId: string): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(indexKey(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isIndex(parsed)) {
      await SecureStore.deleteItemAsync(indexKey(userId)).catch(() => undefined);
      return [];
    }
    const prefix = userPrefix(userId);
    return [...new Set(parsed.keys.filter((key) => key.startsWith(prefix)))].slice(0, MAX_TRACKED_KEYS);
  } catch {
    await SecureStore.deleteItemAsync(indexKey(userId)).catch(() => undefined);
    return [];
  }
}

async function writeTrackedKeysUnlocked(userId: string, keys: string[]) {
  const prefix = userPrefix(userId);
  const next = [...new Set(keys.filter((key) => key.startsWith(prefix)))];
  if (next.length > MAX_TRACKED_KEYS) {
    throw new Error('DURABLE_MUTATION_INDEX_LIMIT');
  }
  if (next.length === 0) {
    await SecureStore.deleteItemAsync(indexKey(userId));
    return;
  }
  await SecureStore.setItemAsync(
    indexKey(userId),
    JSON.stringify({ version: 1, keys: next } satisfies DurableMutationIndex),
  );
}

async function trackEnvelopeKey(userId: string, key: string) {
  await withIndexQueue(userId, async () => {
    const keys = await readTrackedKeysUnlocked(userId);
    if (keys.includes(key)) return;
    await writeTrackedKeysUnlocked(userId, [...keys, key]);
  });
}

async function untrackEnvelopeKey(userId: string, key: string) {
  await withIndexQueue(userId, async () => {
    const keys = await readTrackedKeysUnlocked(userId);
    if (!keys.includes(key)) return;
    await writeTrackedKeysUnlocked(userId, keys.filter((item) => item !== key));
  });
}

async function discardEnvelope(userId: string, key: string) {
  await SecureStore.deleteItemAsync(key).catch(() => undefined);
  await untrackEnvelopeKey(userId, key).catch(() => undefined);
}

export async function mutationPayloadHash(parts: Array<string | null | undefined>) {
  const canonical = JSON.stringify(parts.map((part) => part ?? null));
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical);
}

export async function loadDurableMutation(params: {
  userId: string;
  kind: DurableMutationKind;
  scopeId: string;
}): Promise<DurableMutationEnvelope | null> {
  if (!(await SecureStore.isAvailableAsync())) return null;
  const key = storageKey(params.userId, params.kind, params.scopeId);
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) {
    await untrackEnvelopeKey(params.userId, key).catch(() => undefined);
    return null;
  }
  let parsed: DurableMutationEnvelope;
  try {
    const candidate = JSON.parse(raw) as unknown;
    if (!isEnvelope(candidate)) {
      await discardEnvelope(params.userId, key);
      return null;
    }
    parsed = candidate;
  } catch {
    await discardEnvelope(params.userId, key);
    return null;
  }

  if (parsed.kind !== params.kind || parsed.scopeId !== params.scopeId) {
    await discardEnvelope(params.userId, key);
    return null;
  }
  const created = Date.parse(parsed.createdAt);
  if (!Number.isFinite(created) || Date.now() - created > MAX_AGE_MS) {
    await discardEnvelope(params.userId, key);
    return null;
  }

  // Prepared releases before the deletion-purge registry may have a valid
  // envelope without an index entry. Re-register it before reuse. If registry
  // repair fails, preserve the valid envelope and fail the caller rather than
  // deleting the idempotency key and risking a duplicate mutation.
  await trackEnvelopeKey(params.userId, key);
  return parsed;
}

export async function prepareDurableMutation(params: {
  userId: string;
  kind: DurableMutationKind;
  scopeId: string;
  payloadParts: Array<string | null | undefined>;
  lease: DurableMutationSessionLease;
}) {
  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('SECURE_STORE_UNAVAILABLE');
  }
  if (params.lease.userId !== params.userId) {
    throw new Error('DURABLE_MUTATION_OWNER_MISMATCH');
  }

  assertDurableMutationLease(params.lease);
  const payloadHash = await mutationPayloadHash(params.payloadParts);
  assertDurableMutationLease(params.lease);

  const existing = await loadDurableMutation(params);
  assertDurableMutationLease(params.lease);
  if (existing?.payloadHash === payloadHash) {
    return { envelope: existing, reusedRequestId: true } as const;
  }
  if (existing) {
    // Never replace an unresolved request id with a different payload. After a
    // process death we intentionally do not persist message/visit plaintext, so
    // overwriting here could create a second mutation while the first request
    // may already have committed. The UI must either reconcile the existing
    // receipt or retry the exact same payload (same hash/request id).
    throw new Error(DURABLE_MUTATION_PAYLOAD_MISMATCH);
  }

  const envelope: DurableMutationEnvelope = {
    version: 1,
    kind: params.kind,
    scopeId: params.scopeId,
    requestId: Crypto.randomUUID(),
    payloadHash,
    createdAt: new Date().toISOString(),
  };
  const key = storageKey(params.userId, params.kind, params.scopeId);

  // Serialize the registry + envelope commit under the same user queue. A privacy
  // purge marks the user/session blocked synchronously before it waits on this
  // queue, so a stale operation can never commit after purge and then escape its
  // deletion window.
  await withIndexQueue(params.userId, async () => {
    assertDurableMutationLease(params.lease);
    const keys = await readTrackedKeysUnlocked(params.userId);
    assertDurableMutationLease(params.lease);
    if (!keys.includes(key)) {
      await writeTrackedKeysUnlocked(params.userId, [...keys, key]);
      assertDurableMutationLease(params.lease);
    }

    try {
      await SecureStore.setItemAsync(key, JSON.stringify(envelope));
      assertDurableMutationLease(params.lease);
    } catch (error) {
      // If the session was invalidated while the native write was in flight, remove
      // the just-written envelope before releasing the queue. A following purge is
      // therefore guaranteed to observe either no record or a tracked record.
      await SecureStore.deleteItemAsync(key).catch(() => undefined);
      const tracked = await readTrackedKeysUnlocked(params.userId).catch(() => [] as string[]);
      if (tracked.includes(key)) {
        await writeTrackedKeysUnlocked(
          params.userId,
          tracked.filter((item) => item !== key),
        ).catch(() => undefined);
      }
      throw error;
    }
  });

  return { envelope, reusedRequestId: false } as const;
}

export async function clearDurableMutation(params: {
  userId: string;
  kind: DurableMutationKind;
  scopeId: string;
}) {
  if (!(await SecureStore.isAvailableAsync())) return;
  const key = storageKey(params.userId, params.kind, params.scopeId);
  // If deletion fails, keep the registry entry so a later account-deletion purge
  // can retry it. Registry cleanup itself is best-effort after the envelope is gone.
  await SecureStore.deleteItemAsync(key);
  await untrackEnvelopeKey(params.userId, key).catch(() => undefined);
}

export async function clearAllDurableMutations(userId: string) {
  if (!userId) throw new Error('AUTH_REQUIRED');

  // Mark the whole owner as purging synchronously, before the first await. Any
  // prepare operation that has not committed yet will fail its lease check, while
  // new operations are rejected until the indexed purge has fully completed.
  purgingUsers.add(userId);
  try {
    if (!(await SecureStore.isAvailableAsync())) return { attempted: 0, cleared: 0 } as const;
    return await withIndexQueue(userId, async () => {
      const keys = await readTrackedKeysUnlocked(userId);
      const failed: string[] = [];
      let cleared = 0;
      for (const key of keys) {
        try {
          await SecureStore.deleteItemAsync(key);
          cleared += 1;
        } catch {
          failed.push(key);
        }
      }
      await writeTrackedKeysUnlocked(userId, failed);
      if (failed.length > 0) throw new Error('DURABLE_MUTATION_PURGE_INCOMPLETE');
      return { attempted: keys.length, cleared } as const;
    });
  } finally {
    purgingUsers.delete(userId);
  }
}

export function isDurableMutationPayloadMismatch(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return message.includes(DURABLE_MUTATION_PAYLOAD_MISMATCH);
}
