/** Job-search filters accepted by the existing, canonical Web search RPC. */
export type JobSearchFilterCriteria = Readonly<{
  prefecture: string;
  employmentType: string;
  hoVerifiedOnly: boolean;
  hfVerifiedOnly: boolean;
}>;

export const EMPTY_JOB_SEARCH_FILTERS: JobSearchFilterCriteria = Object.freeze({
  prefecture: '',
  employmentType: '',
  hoVerifiedOnly: false,
  hfVerifiedOnly: false,
});

export function createJobSearchQuery(keyword: string, filters: JobSearchFilterCriteria) {
  return {
    keyword: keyword.trim(),
    prefecture: filters.prefecture,
    employmentType: filters.employmentType,
    hoVerifiedOnly: filters.hoVerifiedOnly,
    hfVerifiedOnly: filters.hfVerifiedOnly,
  };
}

export function hasActiveJobFilters(keyword: string, filters: JobSearchFilterCriteria): boolean {
  return Boolean(keyword.trim() || filters.prefecture || filters.employmentType ||
    filters.hoVerifiedOnly || filters.hfVerifiedOnly);
}
