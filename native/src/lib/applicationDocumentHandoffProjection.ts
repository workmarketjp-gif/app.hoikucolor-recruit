/**
 * Project a candidate/application-verified document snapshot to the parent
 * application warning. Use the same evidence rule as the jobseeker Web's
 * ApplicationMessages document panel: matching destination copy, or a legacy
 * copy of the same type after the original vault document has disappeared.
 *
 * The two-source initial parent read does not know the vault inventory and
 * therefore MUST NOT assume that a same-type legacy copy is sufficient. The
 * opened panel supplies the verified third source for exact Web equivalence.
 * The backend's RLS remains the authorization boundary.
 */
export function applicationDocumentHandoffProjection(
  expectations: readonly {
    source_jobseeker_document_id_snapshot: string;
    destination_file_path: string;
    document_type: string;
  }[],
  submitted: readonly {
    source_jobseeker_document_id: string | null;
    file_path: string;
    document_type: string;
  }[],
  saved?: readonly { id: string }[],
): { expectedCount: number; submittedFromVaultCount: number; missingSourceDocumentIds: string[] } {
  const invalid = () => new Error('応募書類の状態を確認できませんでした。');
  if (!Array.isArray(expectations) || !Array.isArray(submitted) ||
      (saved !== undefined && !Array.isArray(saved))) throw invalid();

  // The canonical endpoint can return duplicate expectation rows. Count each
  // expected vault source only once, preserving the source order for repair.
  const uniqueExpectations: typeof expectations[number][] = [];
  const expectedSourceIds = new Set<string>();
  for (const row of expectations) {
    if (!row || typeof row.source_jobseeker_document_id_snapshot !== 'string' ||
        !row.source_jobseeker_document_id_snapshot.trim() ||
        typeof row.destination_file_path !== 'string' || !row.destination_file_path.trim() ||
        typeof row.document_type !== 'string' || !row.document_type.trim()) throw invalid();
    if (!expectedSourceIds.has(row.source_jobseeker_document_id_snapshot)) {
      expectedSourceIds.add(row.source_jobseeker_document_id_snapshot);
      uniqueExpectations.push(row);
    }
  }

  const submittedPaths = new Set<string>();
  const submittedTypes = new Set<string>();
  for (const row of submitted) {
    if (!row || (row.source_jobseeker_document_id !== null &&
        (typeof row.source_jobseeker_document_id !== 'string' || !row.source_jobseeker_document_id.trim())) ||
        typeof row.file_path !== 'string' || !row.file_path.trim() ||
        typeof row.document_type !== 'string' || !row.document_type.trim()) throw invalid();
    submittedPaths.add(row.file_path);
    submittedTypes.add(row.document_type);
  }

  const savedIds = saved === undefined ? null : new Set<string>();
  if (savedIds) {
    for (const row of saved!) {
      if (!row || typeof row.id !== 'string' || !row.id.trim()) throw invalid();
      savedIds.add(row.id);
    }
  }

  const missingSourceDocumentIds = uniqueExpectations
    .filter((expectation) => {
      if (submittedPaths.has(expectation.destination_file_path)) return false;
      if (savedIds && !savedIds.has(expectation.source_jobseeker_document_id_snapshot) &&
          submittedTypes.has(expectation.document_type)) return false;
      return true;
    })
    .map((row) => row.source_jobseeker_document_id_snapshot);
  return {
    expectedCount: uniqueExpectations.length,
    submittedFromVaultCount: uniqueExpectations.length - missingSourceDocumentIds.length,
    missingSourceDocumentIds,
  };
}
