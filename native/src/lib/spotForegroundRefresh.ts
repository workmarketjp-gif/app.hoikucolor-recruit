/** Eligibility for a quiet Spot snapshot refresh while a candidate is viewing it.
 * Never schedule a read against another candidate, while a read or apply is live,
 * or while the app is backgrounded / locked. Server-side auth remains authoritative.
 */
export type SpotForegroundRefreshState = {
  foreground: boolean;
  ownerKey: string | null;
  currentOwnerKey: string | null;
  verifiedOwnerKey: string | null;
  /** Owner of an explicit initial-read failure. Allows a bounded automatic recovery,
   * never a read on a new account or an arbitrary unverified snapshot. */
  initialFailureOwnerKey?: string | null;
  privateAllowed: boolean;
  readInFlight: boolean;
  applicationInFlight: boolean;
};

export function canRefreshSpotInForeground(state: SpotForegroundRefreshState): boolean {
  const sameOwner = Boolean(state.ownerKey) && state.ownerKey === state.currentOwnerKey;
  const existingVerifiedSnapshot = state.ownerKey === state.verifiedOwnerKey;
  const retryFailedInitialRead = state.verifiedOwnerKey === null &&
    Boolean(state.initialFailureOwnerKey) && state.ownerKey === state.initialFailureOwnerKey;
  return Boolean(sameOwner && (existingVerifiedSnapshot || retryFailedInitialRead)) &&
    state.foreground && state.privateAllowed && !state.readInFlight && !state.applicationInFlight;
}
