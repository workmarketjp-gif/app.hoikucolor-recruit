import type { ApplyDocumentSelection, JobseekerDocumentType } from './documentTypes';

export type ApplyVaultChange = 'loading' | 'loaded' | 'uploaded' | 'error';

/** A vault read failure is neither a valid empty list nor a completed refresh. */
export type ApplyVaultReadbackState = 'ready' | 'loading' | 'failed';

export function applyVaultReadbackState(change: ApplyVaultChange): ApplyVaultReadbackState {
  if (change === 'loading') return 'loading';
  if (change === 'error') return 'failed';
  return 'ready';
}

type CandidateDocumentRef = Readonly<{ id: string; document_type: string }>;

/**
 * The embedded vault reports loading separately from a canonical readback.
 * Never turn its temporary [] loading signal into an empty confirmed list,
 * nor silently select all existing documents when the vault first opens.
 * A newly uploaded document can be preselected only for the type the
 * candidate explicitly opened AND the exact canonical ID reported by the upload.
 * A list diff alone cannot identify a user-initiated upload in the presence of
 * concurrent saves on a different device or session.
 */
export function reconcileApplyVaultSelection(
  previous: readonly CandidateDocumentRef[],
  next: readonly CandidateDocumentRef[],
  selection: ApplyDocumentSelection,
  addingType: JobseekerDocumentType | null,
  change: Extract<ApplyVaultChange, 'loaded' | 'uploaded'>,
  uploadedDocumentId: string | null = null,
): ApplyDocumentSelection {
  const updated: ApplyDocumentSelection = { ...selection };
  for (const type of Object.keys(updated) as JobseekerDocumentType[]) {
    const selected = updated[type];
    if (selected && !next.some((document) => document.id === selected && document.document_type === type)) {
      updated[type] = null;
    }
  }

  if (change === 'uploaded' && addingType && uploadedDocumentId) {
    // The child verifies the RPC save by re-reading canonical records and passes
    // the confirmed saved ID. Never infer upload identity from list additions.
    const wasAlreadyKnown = previous.some((document) => document.id === uploadedDocumentId);
    const confirmedUpload = next.some((document) =>
      document.id === uploadedDocumentId && document.document_type === addingType,
    );
    if (!wasAlreadyKnown && confirmedUpload) updated[addingType] = uploadedDocumentId;
  }
  return updated;
}

/**
 * An embedded vault may have an OS picker, camera permission prompt or network
 * upload in flight while its last canonical document list is still rendered.
 * Never allow the parent application to submit that stale selection.
 * Missing required documents are handled separately to retain the Web's inline
 * validation feedback when the user taps Submit.
 */
export type ApplySubmissionAvailability = Readonly<{
  requirementsReady: boolean;
  submitting: boolean;
  vaultRefreshing: boolean;
  vaultBusy: boolean;
}>;

export function isApplySubmissionUnavailable(state: ApplySubmissionAvailability): boolean {
  return !state.requirementsReady || state.submitting || state.vaultRefreshing || state.vaultBusy;
}

/**
 * The apply step can retain state across an account/session replacement or App
 * Lock cycle. Its document choices must be both loaded for the current owner
 * and freshly available under the foreground privacy boundary.
 * This is a UI guard, not a replacement for authenticated RPC/RLS checks.
 */
export type ApplyDocumentOwnerState = Readonly<{
  loadedOwnerKey: string | null;
  currentOwnerKey: string | null;
  privateAllowed: boolean;
}>;

export function canUseApplyDocumentState(state: ApplyDocumentOwnerState): boolean {
  return Boolean(state.privateAllowed && state.currentOwnerKey &&
    state.loadedOwnerKey === state.currentOwnerKey);
}
