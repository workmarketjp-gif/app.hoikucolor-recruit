import { canActOnCandidateDocument, type CandidateDocumentRow } from './documentVaultPrivacy.ts';

/**
 * An OS Alert can remain open after a vault refresh, replacement, app lock, or
 * account switch. Capture the exact canonical row and revision at prompt time;
 * the destructive callback must prove it is still the same authorized view.
 * This is an additional client-side guard; the server remains authoritative.
 */
export type VaultDeleteConfirmationProof = Readonly<{
  ownerId: string;
  ownerKey: string;
  revision: number;
  documentId: string;
  filePath: string;
  documentType: string;
}>;

export function captureVaultDeleteConfirmation(
  document: CandidateDocumentRow,
  canonicalRows: readonly CandidateDocumentRow[] | null,
  ownerId: string | null,
  ownerKey: string | null,
  freshlyVerifiedOwnerKey: string | null,
  privateAllowed: boolean,
  revision: number,
): VaultDeleteConfirmationProof | null {
  if (!ownerId || !ownerKey || !Number.isSafeInteger(revision) || revision < 0 ||
      !canActOnCandidateDocument(document, canonicalRows, ownerId, ownerKey, freshlyVerifiedOwnerKey, privateAllowed)) {
    return null;
  }
  return {
    ownerId,
    ownerKey,
    revision,
    documentId: document.id,
    filePath: document.file_path,
    documentType: document.document_type,
  };
}

export function canCommitVaultDeleteConfirmation(
  proof: VaultDeleteConfirmationProof | null,
  document: CandidateDocumentRow,
  canonicalRows: readonly CandidateDocumentRow[] | null,
  ownerId: string | null,
  ownerKey: string | null,
  freshlyVerifiedOwnerKey: string | null,
  privateAllowed: boolean,
  revision: number,
): boolean {
  return Boolean(proof &&
    proof.ownerId === ownerId &&
    proof.ownerKey === ownerKey &&
    proof.revision === revision &&
    proof.documentId === document.id &&
    proof.filePath === document.file_path &&
    proof.documentType === document.document_type &&
    canActOnCandidateDocument(document, canonicalRows, ownerId, ownerKey, freshlyVerifiedOwnerKey, privateAllowed));
}
