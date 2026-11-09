import {
  captureDurableMutationSessionLease,
  clearDurableMutation,
  loadDurableMutation,
  prepareDurableMutation,
} from './durableMutation';
import { withHomeApplicationArmGate } from './homeApplicationArmGate';

/**
 * Durable, private *quarantine*, not an idempotency receipt. The backend does
 * not consume this requestId; this helper NEVER authorizes an automatic retry.
 * Existing account-deletion and session-revocation paths clear/block tracked
 * durableMutation envelopes, including the application kind.
 */
export async function hasPendingHomeApplication(userId: string, jobId: string): Promise<boolean> {
  // Do not report a false "no pending application" while another card is
  // still persisting the marker for this candidate and vacancy.
  return withHomeApplicationArmGate(userId, jobId, async () => {
    return (await loadDurableMutation({ userId, kind: 'application', scopeId: jobId })) !== null;
  });
}

/** Returns true if an unresolved receipt existed; caller must not dispatch. */
export async function armPendingHomeApplication(
  userId: string,
  sessionId: string,
  jobId: string,
  documentIds: readonly string[],
): Promise<boolean> {
  // Serializes the entire load+prepare, not only SecureStore writes.
  // Without this gate, two cards for the same job can both see no receipt.
  return withHomeApplicationArmGate(userId, jobId, async () => {
    // Bound the durable marker to the candidate session; do not persist documents.
    const lease = captureDurableMutationSessionLease(userId, sessionId);
    const payloadParts = [jobId, ...[...new Set(documentIds)].sort()];
    const { reusedRequestId } = await prepareDurableMutation({
      userId,
      kind: 'application',
      scopeId: jobId,
      payloadParts,
      lease,
    });
    return reusedRequestId;
  });
}

export async function clearPendingHomeApplication(userId: string, jobId: string): Promise<void> {
  // Keep confirmed-result cleanup in the same per-owner/job ordering domain
  // as arming and reading. Only call after canonical confirmation as before.
  await withHomeApplicationArmGate(userId, jobId, async () => {
    await clearDurableMutation({ userId, kind: 'application', scopeId: jobId });
  });
}
