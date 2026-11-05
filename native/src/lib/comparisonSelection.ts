/** Keep selected comparisons only among jobs returned by the current authorized read. */
export function reconcileComparedSelection(
  selectedIds: readonly string[] | null | undefined,
  authorizedJobIds: readonly string[],
  maximum = 3,
): string[] {
  const allowed = new Set(authorizedJobIds);
  const seen = new Set<string>();
  const output: string[] = [];
  const limit = Math.max(0, Math.floor(maximum));
  for (const id of selectedIds ?? []) {
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= limit) break;
  }
  return output.slice(0, limit);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Resolve only valid incoming job IDs. Canonical job reads enforce publication separately. */
export function requestedComparisonJobIds(params: string | readonly string[] | null | undefined): string[] {
  const ids = typeof params === 'string' ? [params] : Array.isArray(params) ? params : [];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)))].slice(0, 3);
}
