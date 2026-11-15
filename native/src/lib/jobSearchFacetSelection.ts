/**
 * An HTML <select> exposes its current selection. The Native job-search
 * picker must expose the same owner-scoped filter value through visual and
 * accessibility states, including the default "指定しない" option.
 * This helper does not alter the canonical filter, RPC, or facet values.
 */
export function isJobSearchFacetSelected(
  picker: 'prefecture' | 'employment' | null,
  filters: Readonly<{ prefecture: string; employmentType: string }>,
  optionValue: string,
): boolean {
  if (picker === 'prefecture') return filters.prefecture === optionValue;
  if (picker === 'employment') return filters.employmentType === optionValue;
  return false;
}
