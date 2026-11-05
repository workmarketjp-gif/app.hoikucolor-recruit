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
