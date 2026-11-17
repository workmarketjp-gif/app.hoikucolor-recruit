/**
 * Project the already-verified canonical application-document snapshot into the
 * handoff state used by the application detail warning. This is deliberately
 * the same projection used by the direct handoff read: refreshing an opened
 * Web-parity document panel must not leave a stale parent warning behind.
 *
 * Call only after checking the candidate owner, application ID and current
 * focus/session lease. The backend's RLS remains the authorization boundary.
 */
export function applicationDocumentHandoffProjection(
  expectations: readonly { source_jobseeker_document_id_snapshot: string }[],
  submitted: readonly { source_jobseeker_document_id: string | null }[],
): { expectedCount: number; submittedFromVaultCount: number; missingSourceDocumentIds: string[] } {
  if (!Array.isArray(expectations) || !Array.isArray(submitted)) {
    throw new Error('応募書類の状態を確認できませんでした。');
  }
  const expectedIds: string[] = [];
  const seen = new Set<string>();
  for (const row of expectations) {
    const id = row?.source_jobseeker_document_id_snapshot;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('応募書類の状態を確認できませんでした。');
    }
    if (!seen.has(id)) {
      seen.add(id);
      expectedIds.push(id);
    }
  }
  const submittedIds = new Set<string>();
  for (const row of submitted) {
    const id = row?.source_jobseeker_document_id;
    if (id === null) continue;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('応募書類の状態を確認できませんでした。');
    }
    submittedIds.add(id);
  }
  const missingSourceDocumentIds = expectedIds.filter((id) => !submittedIds.has(id));
  return {
    expectedCount: expectedIds.length,
    submittedFromVaultCount: expectedIds.length - missingSourceDocumentIds.length,
    missingSourceDocumentIds,
  };
}
