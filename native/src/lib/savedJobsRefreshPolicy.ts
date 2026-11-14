/**
 * A same-session manual refresh may show the last authenticated saved jobs,
 * but must never allow a stale row to open, compare, or be unsaved while
 * readback is pending or has failed. Focus, App Lock and account changes clear
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

/** Stale rows are presentation-only until a fresh canonical RPC succeeds. */
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
