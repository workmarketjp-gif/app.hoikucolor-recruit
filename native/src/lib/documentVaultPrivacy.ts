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
  if (!privateAllowed || !ownerId || !ownerId.trim() || !currentOwnerKey ||
      freshlyVerifiedOwnerKey !== currentOwnerKey || !Array.isArray(canonicalRows) ||
      !document || document.jobseeker_clerk_user_id !== ownerId ||
      typeof document.file_path !== 'string' || !document.file_path ||
      typeof document.document_type !== 'string' || !document.document_type) return false;

  // Do not use a matching row within a mixed-owner or duplicated snapshot.
  // Canonical RLS authorization remains mandatory for every private operation.
  try { assertCandidateDocumentListOwner(canonicalRows, ownerId); } catch { return false; }
  if (new Set(canonicalRows.map((row) => row.id)).size !== canonicalRows.length) return false;
  const matches = canonicalRows.filter((row) => row.id === document.id);
  return matches.length === 1 &&
    matches[0].file_path === document.file_path &&
    matches[0].document_type === document.document_type;
}

/** Never acknowledge a private document mutation without authoritative readback. */
export function confirmCandidateDocumentMutation(
  rows: readonly CandidateDocumentRow[],
  ownerId: string,
  targetId: string,
  kind: 'uploaded' | 'made-default' | 'deleted',
  expected?: CandidateDocumentRow,
): void {
  assertCandidateDocumentListOwner(rows, ownerId);
  const invalid = () => new Error('書類の保存結果を確認できませんでした。再読み込みして状態を確認してください。');
  if (!targetId.trim() || new Set(rows.map((row) => row.id)).size !== rows.length) throw invalid();
  const current = rows.find((row) => row.id === targetId);
  // A saved document must be the same private source registered by the API.
  const exactUpload = !expected || Boolean(current &&
    expected.id === targetId && expected.jobseeker_clerk_user_id === ownerId &&
    current.file_path === expected.file_path && current.document_type === expected.document_type);
  const defaultsOfType = current ? rows.filter((row) =>
    row.document_type === current.document_type && row.is_default === true) : [];
  const soleTargetDefault = Boolean(current?.is_default === true &&
    defaultsOfType.length === 1 && defaultsOfType[0]?.id === targetId);
  const confirmed = kind === 'deleted' ? current === undefined :
    kind === 'made-default' ? soleTargetDefault :
    Boolean(current && exactUpload && (!expected?.is_default || soleTargetDefault));
  if (!confirmed) throw invalid();
}
