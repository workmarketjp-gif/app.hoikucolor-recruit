import type { ApplyDocumentSelection, ApplyDocumentRow, JobDocumentRequirements, JobseekerDocumentType } from './documentTypes';

export type ApplyDocumentPreflightResult = 'ready' | 'requirements_changed' | 'document_changed';
type FreshDocument = Readonly<{ id: string; document_type: JobseekerDocumentType }>;

/** Compare actual configured facility requirements, not the visual row order. */
function sameRequirements(a: JobDocumentRequirements, b: JobDocumentRequirements): boolean {
  if (a.configured !== b.configured || a.items.length !== b.items.length) return false;
  const ordered = (r: JobDocumentRequirements) => [...r.items]
    .map(({ document_type, requirement, note }) => [document_type, requirement, note ?? null] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}

/**
 * A displayed apply sheet can become stale when a facility changes its rules or
 * a candidate removes a private document on another device. Use only a fresh
 * candidate-authorized readback; the caller must check identity/session/focus.
 * Never silently omit a selected document. Server RLS/RPC stays authoritative.
 */
export function evaluateApplyDocumentSubmissionPreflight(
  shownRequirements: JobDocumentRequirements,
  freshRequirements: JobDocumentRequirements,
  shownRows: readonly ApplyDocumentRow[],
  selection: ApplyDocumentSelection,
  freshDocuments: readonly FreshDocument[],
): ApplyDocumentPreflightResult {
  if (!sameRequirements(shownRequirements, freshRequirements)) return 'requirements_changed';
  for (const row of shownRows) {
    const selectedId = selection[row.type] ?? null;
    if (row.level === 'required' && !selectedId) return 'document_changed';
    if (!selectedId) continue;
    if (!row.candidates.some(d => d.id === selectedId && d.document_type === row.type) ||
        !freshDocuments.some(d => d.id === selectedId && d.document_type === row.type)) return 'document_changed';
  }
  return 'ready';
}
