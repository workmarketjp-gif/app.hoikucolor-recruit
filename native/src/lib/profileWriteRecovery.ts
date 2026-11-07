/**
 * A profile upsert may have committed even if the transport or its canonical
 * readback failed. The UI must not blindly repeat a potentially stale write.
 * Authorization and persistence remain the responsibility of the pinned
 * candidate client and server RLS; this helper only gates presentation/actions.
 */
export type ProfileSaveEligibility = Readonly<{
  ownerKey: string | null;
  loadedOwnerKey: string | null;
  privateAllowed: boolean;
  loading: boolean;
  saving: boolean;
  needsCanonicalReload: boolean;
}>;

export function canAttemptProfileSave(input: ProfileSaveEligibility): boolean {
  return Boolean(input.ownerKey && input.ownerKey === input.loadedOwnerKey &&
    input.privateAllowed && !input.loading && !input.saving && !input.needsCanonicalReload);
}

/** Once the network write starts, every failure needs a fresh canonical read. */
export function profileWriteFailureNeedsReload(writeAttempted: boolean): boolean {
  return writeAttempted;
}

/** A user's unsaved edits must never be silently discarded by recovery. */
export function profileReloadNeedsDiscardConfirmation(hasUnsavedChanges: boolean): boolean {
  return hasUnsavedChanges;
}
