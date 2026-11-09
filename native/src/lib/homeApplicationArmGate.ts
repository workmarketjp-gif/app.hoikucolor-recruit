/**
 * In-process serialization for the candidate/job application quarantine.
 *
 * The shared durable registry hashes and reads the old receipt BEFORE entering
 * its per-user write queue. Two mounted cards for the same vacancy can both
 * observe an empty store, then each persist a different receipt and dispatch.
 * Hold this narrow gate over the existing load + prepare call; the second arm
 * must observe the first marker and be rejected by its caller.
 *
 * This is NOT a server idempotency key and does not protect separate devices.
 */
const pendingArmQueues = new Map<string, Promise<void>>();

export async function withHomeApplicationArmGate<T>(
  userId: string,
  jobId: string,
  action: () => Promise<T>,
): Promise<T> {
  if (!userId) throw new Error('AUTH_REQUIRED');
  if (!jobId) throw new Error('MUTATION_SCOPE_REQUIRED');
  // JSON tuple avoids ambiguous string concatenation of opaque IDs.
  const scope = JSON.stringify([userId, jobId]);
  const previous = pendingArmQueues.get(scope) ?? Promise.resolve();
  let release!: () => void;
  const complete = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.catch(() => undefined).then(() => complete);
  pendingArmQueues.set(scope, tail);

  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (pendingArmQueues.get(scope) === tail) pendingArmQueues.delete(scope);
  }
}
