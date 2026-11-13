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
