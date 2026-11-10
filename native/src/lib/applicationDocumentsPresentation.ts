/**
 * Jobseeker Web ApplicationMessages document-state projection.
 * Treat a document as submitted only after a canonical application-specific read.
 * Never derive permission or 'verified qualification' status from these rows.
 * Web baseline: src/components/ApplicationMessages.tsx at main fa779e73.
 */
export type ApplicationVaultRow = {
  id: string;
  document_type: string;
  title: string;
  is_default: boolean;
};

export type SubmittedApplicationRow = {
  id: string;
  application_id: string;
  source_jobseeker_document_id: string | null;
  document_type: string;
  title: string;
  file_path: string;
};

export type ApplicationExpectationRow = {
  source_jobseeker_document_id_snapshot: string;
  destination_file_path: string;
  document_type: string;
};

export function projectApplicationDocuments<
  T extends ApplicationVaultRow,
  U extends SubmittedApplicationRow,
  V extends ApplicationExpectationRow,
>(
  applicationId: string,
  saved: readonly T[],
  submitted: readonly U[],
  expectations: readonly V[],
) {
  if (!applicationId || submitted.some((row) => row.application_id !== applicationId)) {
    throw new Error('提出済み書類の応募先を確認できませんでした。');
  }
  const attachedIds = new Set(submitted.map((row) => row.source_jobseeker_document_id).filter((id): id is string => Boolean(id)));
  const submittedPaths = new Set(submitted.map((row) => row.file_path));
  const savedById = new Map(saved.map((row) => [row.id, row]));
  const submittedTypes = new Set(submitted.map((row) => row.document_type));
  // Web compatibility: historical submitted copies may be present even if a
  // former vault source was deleted; matching type avoids a phantom warning.
  const missing = expectations.filter((row) => {
    if (submittedPaths.has(row.destination_file_path)) return false;
    if (!savedById.has(row.source_jobseeker_document_id_snapshot) && submittedTypes.has(row.document_type)) return false;
    return true;
  });
  const repairable = missing
    .map((row) => savedById.get(row.source_jobseeker_document_id_snapshot))
    .filter((row): row is T => Boolean(row));
  return {
    attachedIds,
    missing,
    repairable,
    unavailableMissingCount: missing.length - repairable.length,
  };
}

export function hasCanonicalApplicationAttachment(
  applicationId: string,
  sourceDocumentId: string,
  submitted: readonly SubmittedApplicationRow[],
): boolean {
  return Boolean(applicationId && sourceDocumentId && submitted.some((row) =>
    row.application_id === applicationId &&
    row.source_jobseeker_document_id === sourceDocumentId &&
    row.id.length > 0 && row.file_path.length > 0,
  ));
}
