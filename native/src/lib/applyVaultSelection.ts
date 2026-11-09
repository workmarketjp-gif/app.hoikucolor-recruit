import type { ApplyDocumentSelection, JobseekerDocumentType } from './documentTypes';

export type ApplyVaultChange = 'loading' | 'loaded' | 'uploaded';

type CandidateDocumentRef = Readonly<{ id: string; document_type: string }>;

/**
 * The embedded vault reports loading separately from a canonical readback.
 * Never turn its temporary [] loading signal into an empty confirmed list,
 * nor silently select all existing documents when the vault first opens.
 * A newly uploaded document can be preselected only for the type the
 * candidate explicitly opened and only when its new identity is unambiguous.
 */
export function reconcileApplyVaultSelection(
  previous: readonly CandidateDocumentRef[],
  next: readonly CandidateDocumentRef[],
  selection: ApplyDocumentSelection,
  addingType: JobseekerDocumentType | null,
  change: Exclude<ApplyVaultChange, 'loading'>,
): ApplyDocumentSelection {
  const updated: ApplyDocumentSelection = { ...selection };
  for (const type of Object.keys(updated) as JobseekerDocumentType[]) {
    const selected = updated[type];
    if (selected && !next.some((document) => document.id === selected && document.document_type === type)) {
      updated[type] = null;
    }
  }

  if (change === 'uploaded' && addingType) {
    const known = new Set(previous.map((document) => document.id));
    const added = next.filter((document) =>
      document.document_type === addingType && document.id.length > 0 && !known.has(document.id),
    );
    if (added.length === 1) updated[addingType] = added[0].id;
  }
  return updated;
}
