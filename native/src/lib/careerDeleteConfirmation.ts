/**
 * Keep the exact career-delete dialog context. React Native Alert callbacks
 * can fire after a candidate/session switch, App Lock, canonical reload or
 * an edit; a fresh tap is required in all of those cases.
 *
 * This is a client-side fence, not an authorization substitute. The eventual
 * delete still uses the existing owner-pinned canonical RPC and RLS.
 */
export type CareerDeleteConfirmation = Readonly<{
  ownerKey: string;
  generation: number;
  formRevision: number;
}>;

export function captureCareerDeleteConfirmation(
  ownerKey: string | null,
  generation: number,
  formRevision: number,
  privateAllowed: boolean,
): CareerDeleteConfirmation | null {
  if (!privateAllowed || !ownerKey) return null;
  return { ownerKey, generation, formRevision };
}

export function mayExecuteCareerDeletion(
  confirmation: CareerDeleteConfirmation | null,
  currentOwnerKey: string | null,
  currentGeneration: number,
  currentFormRevision: number,
  privateAllowed: boolean,
): boolean {
  return confirmation !== null && privateAllowed && currentOwnerKey !== null &&
    confirmation.ownerKey === currentOwnerKey &&
    confirmation.generation === currentGeneration &&
    confirmation.formRevision === currentFormRevision;
}
