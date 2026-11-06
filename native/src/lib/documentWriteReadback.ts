/**
 * Candidate document writes can commit on the server even when the RPC reply is
 * lost. Treat the independent canonical row as the only success criterion.
 *
 * IMPORTANT: The caller must not delete the uploaded source/copy when this
 * function rejects. A missing/failed readback does NOT prove the registration
 * rolled back; orphan cleanup requires a separate server-owned, age-checked
 * reconciliation process.
 */
export async function confirmCandidateDocumentWrite<T>(options: {
  register: () => Promise<T | null>;
  readback: () => Promise<T | null>;
  matches: (row: T) => boolean;
  uncertainMessage: string;
  mismatchMessage: string;
}): Promise<T> {
  try {
    await options.register();
  } catch {
    // A network timeout is an unknown commit result, not proof of rollback.
  }
  let canonical: T | null;
  try {
    canonical = await options.readback();
  } catch {
    throw new Error(options.uncertainMessage);
  }
  if (!canonical) throw new Error(options.uncertainMessage);
  if (!options.matches(canonical)) throw new Error(options.mismatchMessage);
  return canonical;
}
