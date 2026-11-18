import {
  assertCandidateDocumentListOwner,
  type CandidateDocumentRow,
} from './documentVaultPrivacy.ts';

/**
 * Web /profile -> 応募書類 "差し替え" is shown for the current default source.
 * It uploads a NEW row with makeDefault=true, preserving the previous row,
 * which becomes non-default. No automatic deletion or submitted-copy change.
 *
 * A confirmation checks presentation-level integrity after the canonical
 * candidate-scoped read; server-side RLS remains the authorization boundary.
 */
export function confirmCandidateVaultReplacementPreserved<T extends CandidateDocumentRow>(options: {
  previous: T;
  uploaded: T;
  canonicalRows: readonly T[];
  ownerId: string;
  isCurrent: () => boolean;
}): readonly T[] {
  const uncertain = () => new Error('差し替え後の書類一覧を確認できませんでした。再読み込みして状態を確認してください。');
  const { previous, uploaded, canonicalRows, ownerId, isCurrent } = options;
  if (typeof ownerId !== 'string' || !ownerId.trim() || !isCurrent() || !previous || !uploaded ||
      previous.id === uploaded.id ||
      previous.jobseeker_clerk_user_id !== ownerId ||
      uploaded.jobseeker_clerk_user_id !== ownerId ||
      previous.document_type !== uploaded.document_type ||
      previous.is_default !== true || uploaded.is_default !== true ||
      !previous.file_path || !uploaded.file_path || previous.file_path === uploaded.file_path) throw uncertain();

  try {
    assertCandidateDocumentListOwner(canonicalRows, ownerId);
  } catch {
    throw uncertain();
  }
  const oldMatches = canonicalRows.filter((row) => row.id === previous.id);
  const newMatches = canonicalRows.filter((row) => row.id === uploaded.id);
  if (oldMatches.length !== 1 || newMatches.length !== 1) throw uncertain();
  const oldRow = oldMatches[0];
  const newRow = newMatches[0];
  if (oldRow.file_path !== previous.file_path ||
      oldRow.document_type !== previous.document_type ||
      oldRow.is_default !== false ||
      newRow.file_path !== uploaded.file_path ||
      newRow.document_type !== uploaded.document_type ||
      newRow.is_default !== true ||
      canonicalRows.some((row) =>
        row.document_type === previous.document_type && row.id !== uploaded.id && row.is_default === true) ||
      !isCurrent()) throw uncertain();
  return canonicalRows;
}
