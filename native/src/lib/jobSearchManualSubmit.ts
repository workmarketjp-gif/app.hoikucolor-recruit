/**
 * React's `loading` render can still reflect a previous request when a
 * Japanese IME `onChangeText` immediately precedes keyboard Search.
 * Search generation is invalidated synchronously on edit, so an older
 * request must not block submitting the new text. A request for the current
 * generation is still single-flight. Server auth remains pinned separately.
 */
export function canStartManualJobSearch(
  currentGeneration: number,
  inFlightGeneration: number | null,
  ownerKey: string | null,
  privateAllowed: boolean,
): boolean {
  return Boolean(ownerKey) && privateAllowed && inFlightGeneration !== currentGeneration;
}
