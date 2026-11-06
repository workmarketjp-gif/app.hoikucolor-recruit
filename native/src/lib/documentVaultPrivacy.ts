/** Extra client-side presentation protection; server RLS remains authoritative. */
export type CandidateDocumentRow = Readonly<{
  id: string;
  jobseeker_clerk_user_id: string;
  file_path: string;
  document_type: string;
  is_default?: boolean;
}>;

export function assertCandidateDocumentListOwner(
  rows: readonly CandidateDocumentRow[],
  ownerId: string,
): void {
  if (!ownerId.trim() || !Array.isArray(rows) || rows.some((row) =>
    !row || typeof row.id !== 'string' || !row.id ||
    row.jobseeker_clerk_user_id !== ownerId ||
    typeof row.file_path !== 'string' || !row.file_path
  )) {
    throw new Error('応募書類の閲覧権限を確認できませんでした。');
  }
}

/** Check a button's row against a fresh, exact-session, canonical list. */
export function canActOnCandidateDocument(
  document: CandidateDocumentRow,
  canonicalRows: readonly CandidateDocumentRow[] | null,
  ownerId: string | null,
  currentOwnerKey: string | null,
  freshlyVerifiedOwnerKey: string | null,
  privateAllowed: boolean,
): boolean {
  return Boolean(privateAllowed && ownerId && currentOwnerKey &&
    freshlyVerifiedOwnerKey === currentOwnerKey && canonicalRows?.some((row) =>
      row.id === document.id &&
      row.jobseeker_clerk_user_id === ownerId &&
      document.jobseeker_clerk_user_id === ownerId &&
      row.file_path === document.file_path &&
      row.document_type === document.document_type));
}

/** Never acknowledge a private document mutation without authoritative readback. */
export function confirmCandidateDocumentMutation(
  rows: readonly CandidateDocumentRow[],
  ownerId: string,
  targetId: string,
  kind: 'uploaded' | 'made-default' | 'deleted',
): void {
  assertCandidateDocumentListOwner(rows, ownerId);
  const current = rows.find((row) => row.id === targetId);
  const confirmed = kind === 'deleted' ? !current :
    kind === 'made-default' ? current?.is_default === true : Boolean(current);
  if (!targetId.trim() || !confirmed) {
    throw new Error('書類の保存結果を確認できませんでした。再読み込みして状態を確認してください。');
  }
}
