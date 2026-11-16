import type { ApplyDocumentSelection, ApplyDocumentRow, JobDocumentRequirements, JobseekerDocumentType } from './documentTypes';

/**
 * Embedded vault operation notifications must reach the apply guard before
 * React has rendered the next busy state. A started operation revokes any
 * pending preflight against the old selection, even if it finishes quickly.
 */
export function recordApplyVaultBusyTransition(
  busy: boolean,
  busyRef: { current: boolean },
  selectionRevision: { current: number },
): void {
  if (busy && !busyRef.current) selectionRevision.current += 1;
  busyRef.current = busy;
}

export type ApplyDocumentPreflightResult = 'ready' | 'requirements_changed' | 'document_changed';
type FreshDocument = Readonly<{ id: string; document_type: JobseekerDocumentType; file_path?: string; updated_at?: string }>;

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
    const displayed = row.candidates.find(d => d.id === selectedId && d.document_type === row.type) as
      (typeof row.candidates[number] & { file_path?: string; updated_at?: string }) | undefined;
    const canonical = freshDocuments.find(d => d.id === selectedId && d.document_type === row.type);
    if (!displayed || !canonical) return 'document_changed';
    // Native vault rows include both fields. A document can be replaced or
    // revised on another device without changing its ID or document type.
    // Never submit a different revision than the candidate reviewed.
    if (typeof displayed.file_path === 'string' && displayed.file_path !== canonical.file_path) return 'document_changed';
    if (typeof displayed.updated_at === 'string' && displayed.updated_at !== canonical.updated_at) return 'document_changed';
  }
  return 'ready';
}

export type FreshApplyDocumentState = Readonly<{
  requirements: JobDocumentRequirements;
  documents: readonly FreshDocument[];
}>;

/**
 * The embedded document vault may finish a read or upload while the final
 * requirements request is pending. Never submit the earlier radio selection
 * after that local state has changed, even if the server still has the IDs.
 * Caller pins the session and owns the revision/visibility check; this function
 * neither sends an application nor retries an ambiguous write.
 */
export async function reviewApplyDocumentsBeforeSubmit(
  shownRequirements: JobDocumentRequirements,
  shownRows: readonly ApplyDocumentRow[],
  selection: ApplyDocumentSelection,
  readFresh: () => Promise<FreshApplyDocumentState>,
  isCurrent: () => boolean,
): Promise<ApplyDocumentPreflightResult | 'invalidated'> {
  if (!isCurrent()) return 'invalidated';
  const fresh = await readFresh();
  if (!isCurrent()) return 'invalidated';
  return evaluateApplyDocumentSubmissionPreflight(
    shownRequirements, fresh.requirements, shownRows, selection, fresh.documents,
  );
}
