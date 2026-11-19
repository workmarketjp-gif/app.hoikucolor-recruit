/** Eligibility for a quiet Spot snapshot refresh while a candidate is viewing it.
 * Never schedule a read against another candidate, while a read or apply is live,
 * or while the app is backgrounded / locked. Server-side auth remains authoritative.
 */
export type SpotForegroundRefreshState = {
  foreground: boolean;
  ownerKey: string | null;
  currentOwnerKey: string | null;
  verifiedOwnerKey: string | null;
  privateAllowed: boolean;
  readInFlight: boolean;
  applicationInFlight: boolean;
};

export function canRefreshSpotInForeground(state: SpotForegroundRefreshState): boolean {
  return state.foreground && Boolean(state.ownerKey) &&
    state.ownerKey === state.currentOwnerKey &&
    state.ownerKey === state.verifiedOwnerKey &&
    state.privateAllowed && !state.readInFlight && !state.applicationInFlight;
}
