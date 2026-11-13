/**
 * Keep previously confirmed thread rows visible only for a deliberate,
 * still-authorized same-session manual refresh. Focus/lock/account transitions
 * still quarantine old private data. Visibility does not authorize navigation.
 */
export function canPreserveMessageInboxDuringManualRefresh(options: {
  manual: boolean;
  expectedOwnerKey: string | null;
  lastVerifiedOwnerKey: string | null;
  privateAccessAllowed: boolean;
  navigationPending: boolean;
}): boolean {
  return options.manual && options.privateAccessAllowed && !options.navigationPending &&
    !!options.expectedOwnerKey && options.lastVerifiedOwnerKey === options.expectedOwnerKey;
}

/** Until canonical revalidation succeeds, rows may be seen but never opened. */
export function canOpenVerifiedMessageInboxThread(options: {
  listPresent: boolean;
  currentOwnerVerified: boolean;
  refreshInFlight: boolean;
  refreshFailed: boolean;
}): boolean {
  return options.listPresent && options.currentOwnerVerified &&
    !options.refreshInFlight && !options.refreshFailed;
}

/**
 * Ref-backed, synchronous guard against repeated user refresh taps before
 * React updates its disabled/loading state. A focus re-entry may start only
 * after the previous screen lease has revoked and cleared this pending flag.
 * This prevents duplicate candidate-private token and application reads; it
 * does not suppress an intentional retry after the previous read settles.
 */
export function canStartMessageInboxRefresh(options: {
  refreshPending: boolean;
  threadOpenPending: boolean;
  secondaryNavigationPending: boolean;
}): boolean {
  return !options.refreshPending && !options.threadOpenPending &&
    !options.secondaryNavigationPending;
}
