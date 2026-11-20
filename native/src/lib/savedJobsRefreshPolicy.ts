/**
 * A same-session manual refresh may show the last authenticated saved jobs,
 * and allow read-only navigation to separately reauthorized detail/compare
 * screens while readback is pending or failed. Unsave is still blocked.
 * Focus, App Lock and account changes clear
 * the verification lease before the next canonical read.
 */
export function retainSavedJobsDuringManualRefresh(options: {
  manual: boolean;
  ownerKey: string | null;
  verifiedOwnerKey: string | null;
  privateAllowed: boolean;
  focusActive: boolean;
  mutationPending: boolean;
}): boolean {
  return options.manual && options.privateAllowed && options.focusActive &&
    !options.mutationPending && options.ownerKey !== null &&
    options.verifiedOwnerKey === options.ownerKey;
}

/** A synchronous ref protects a new read before React updates disabled/loading. */
export function canStartSavedJobsRefresh(options: {
  refreshPending: boolean;
  mutationPending: boolean;
  privateAllowed: boolean;
  focusActive: boolean;
  ownerKey: string | null;
}): boolean {
  return !options.refreshPending && !options.mutationPending &&
    options.privateAllowed && options.focusActive && options.ownerKey !== null;
}

/** Writes stay disabled while the saved state is uncertain. */
export function canActOnSavedJobs(options: {
  hasVerifiedRows: boolean;
  loading: boolean;
  readFailed: boolean;
  privateAllowed: boolean;
  focusActive: boolean;
  mutationPending: boolean;
}): boolean {
  return options.hasVerifiedRows && !options.loading && !options.readFailed &&
    options.privateAllowed && options.focusActive && !options.mutationPending;
}

/**
 * Web SavedView allows viewing a previously confirmed job and comparing
 * verified rows while a same-session manual saved-list refresh is pending
 * or failed. The destination reauthorizes the job independently. This gate
 * never authorizes unsave, application submission or a server mutation.
 * Reject first-load/error, revoked focus, lock, session switch, duplicate
 * route taps and pending saved mutations.
 */
export function canNavigateVerifiedSavedJob(options: {
  ownerKey: string | null;
  verifiedOwnerKey: string | null;
  hasVerifiedRows: boolean;
  privateAllowed: boolean;
  focusActive: boolean;
  mutationPending: boolean;
  navigationPending: boolean;
}): boolean {
  return options.hasVerifiedRows && options.privateAllowed &&
    options.focusActive && !options.mutationPending &&
    !options.navigationPending && !!options.ownerKey &&
    options.verifiedOwnerKey === options.ownerKey;
}
