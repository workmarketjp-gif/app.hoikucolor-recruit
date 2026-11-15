/**
 * Keep confirmed job-search filter names while a manual facet refresh runs or
 * fails. Reuse is permitted only for the same candidate and session while
 * private reads remain allowed; this does not retain any job counts.
 */
export function retainedJobSearchFacets<T>(
  previous: Readonly<{ ownerKey: string; value: T }> | null,
  ownerKey: string | null,
  privateAllowed: boolean,
): Readonly<{ ownerKey: string; value: T }> | null {
  return privateAllowed && ownerKey && previous?.ownerKey === ownerKey ? previous : null;
}
