import {
  assertCandidateDocumentListOwner,
  type CandidateDocumentRow,
} from './documentVaultPrivacy.ts';

/** Require the same canonical default before starting a replacement Storage write. */
export function requireFreshVaultReplacement<T extends CandidateDocumentRow>(options: {
  previous: T;
  visibleRows: readonly T[] | null;
  canonicalRows: readonly T[];
  ownerId: string;
  selectedType: string;
  initialRevision: number | null;
  currentRevision: number;
  isCurrent: () => boolean;
}): void {
  const stale = () => new Error('差し替え対象の書類が変更された可能性があります。再読み込みしてから差し替えてください。');
  const { previous, visibleRows, canonicalRows, ownerId, selectedType,
    initialRevision, currentRevision, isCurrent } = options;
  if (typeof ownerId !== 'string' || !ownerId.trim() ||
      typeof selectedType !== 'string' || !selectedType.trim() ||
      !Number.isSafeInteger(initialRevision) || initialRevision === null || initialRevision < 0 ||
      !Number.isSafeInteger(currentRevision) || currentRevision !== initialRevision ||
      !previous || previous.jobseeker_clerk_user_id !== ownerId ||
      typeof previous.id !== 'string' || !previous.id ||
      typeof previous.file_path !== 'string' || !previous.file_path ||
      previous.document_type !== selectedType || previous.is_default !== true ||
      typeof isCurrent !== 'function' || !isCurrent()) throw stale();
  try {
    assertCandidateDocumentListOwner(visibleRows as readonly T[], ownerId);
    assertCandidateDocumentListOwner(canonicalRows, ownerId);
  } catch { throw stale(); }
  for (const rows of [visibleRows!, canonicalRows]) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw stale();
    const matches = rows.filter((row) => row.id === previous.id);
    const defaults = rows.filter((row) => row.document_type === selectedType && row.is_default === true);
    if (matches.length !== 1 || defaults.length !== 1 || defaults[0].id !== previous.id ||
        matches[0].jobseeker_clerk_user_id !== ownerId ||
        matches[0].file_path !== previous.file_path ||
        matches[0].document_type !== selectedType || matches[0].is_default !== true) throw stale();
  }
  if (!isCurrent()) throw stale();
}
