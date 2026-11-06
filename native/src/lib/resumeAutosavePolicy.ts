/** Web /resume uses a 1.2s debounce; never persist a private draft without a live owner. */
export const RESUME_AUTOSAVE_DELAY_MS = 1200;

export type ResumeAutosaveContext = {
  ownerKey: string | null;
  loadedOwner: string | null;
  privateAllowed: boolean;
  loading: boolean;
  dirty: boolean;
  saving: boolean;
  pausedAfterError: boolean;
};

/** A failed/ambiguous mutation must not be retried by a subsequent debounce. */
export function shouldScheduleResumeAutosave(context: ResumeAutosaveContext): boolean {
  return Boolean(context.ownerKey) && context.loadedOwner === context.ownerKey &&
    context.privateAllowed && !context.loading && context.dirty &&
    !context.saving && !context.pausedAfterError;
}

/** Reloading the canonical record discards local edits; demand affirmative consent. */
export function shouldConfirmResumeReload(hasUnsavedEdits: boolean): boolean {
  return hasUnsavedEdits;
}
