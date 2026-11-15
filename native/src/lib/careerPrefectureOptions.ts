/**
 * The JOBSEEKER Web /career <select> uses salary-market coverage and retains
 * the candidate's selected region even when no coverage row includes it.
 * This is a display-only projection: it never estimates job counts or changes
 * the authoritative RPC request.
 */
export type CareerPrefectureCoverage = Readonly<{ prefecture: string; count: number }>;
export type CareerPrefectureOption = Readonly<{ value: string; count: number | null }>;

export function careerPrefectureOptions(
  coverage: readonly CareerPrefectureCoverage[], selected: string,
): CareerPrefectureOption[] {
  const options = new Map<string, number | null>();
  for (const row of coverage) {
    if (!row || typeof row.prefecture !== 'string' || !row.prefecture.trim()) continue;
    // Never invent or display an unverified count. Duplicate rows follow Web's Map semantics.
    const count = Number.isSafeInteger(row.count) && row.count >= 0 ? row.count : null;
    options.set(row.prefecture, count);
  }
  if (selected && !options.has(selected)) options.set(selected, null);
  return [...options].sort(([a], [b]) => a.localeCompare(b, 'ja'))
    .map(([value, count]) => ({ value, count }));
}
