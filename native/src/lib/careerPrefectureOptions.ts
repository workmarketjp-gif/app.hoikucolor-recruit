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


/**
 * A successful canonical salary-market read authorizes showing its facet NAMES,
 * not carrying a past request's job COUNTS into another search scope. This
 * snapshot is held in component state and must be bound to its candidate session.
 */
export type CareerFacetNames = Readonly<{
  prefectures: readonly string[];
  employmentTypes: readonly string[];
}>;

export function rememberCareerFacetNames(
  previous: CareerFacetNames | null,
  facets: Readonly<{
    coverage: readonly CareerPrefectureCoverage[];
    employment_types: readonly string[];
  }>,
): CareerFacetNames {
  const prefectures = new Set(previous?.prefectures ?? []);
  const employmentTypes = new Set(previous?.employmentTypes ?? []);
  for (const row of facets.coverage ?? []) {
    if (typeof row?.prefecture === 'string' && row.prefecture.trim()) prefectures.add(row.prefecture);
  }
  for (const type of facets.employment_types ?? []) {
    if (typeof type === 'string' && type.trim()) employmentTypes.add(type);
  }
  return { prefectures: [...prefectures].sort((a, b) => a.localeCompare(b, 'ja')),
    employmentTypes: [...employmentTypes].sort((a, b) => a.localeCompare(b, 'ja')) };
}

/** Keep proven facet names selectable while another request loads or fails. */
export function careerPrefectureOptionsWithHistory(
  coverage: readonly CareerPrefectureCoverage[],
  selected: string,
  priorNames: readonly string[],
): CareerPrefectureOption[] {
  const items = careerPrefectureOptions(coverage, selected);
  const present = new Set(items.map((item) => item.value));
  for (const name of priorNames) {
    if (typeof name === 'string' && name.trim() && !present.has(name)) {
      items.push({ value: name, count: null });
      present.add(name);
    }
  }
  return items.sort((a, b) => a.value.localeCompare(b.value, 'ja'));
}

export function careerEmploymentOptions(
  currentTypes: readonly string[],
  selected: string,
  priorNames: readonly string[],
): string[] {
  const options = new Set<string>();
  for (const name of [...priorNames, ...currentTypes, selected]) {
    if (typeof name === 'string' && name.trim()) options.add(name);
  }
  return [...options].sort((a, b) => a.localeCompare(b, 'ja'));
}
