/**
 * Candidate Native search RPC read boundary. Fail rather than report zero jobs,
 * zero filters, or a fabricated organic ranking when a response is incomplete.
 * Only the existing authenticated RPC decides which jobs may be visible.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const row = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const numeric = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
const count = (value: unknown): number | null => {
  if (!numeric(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};
// An undefined or malformed publication timestamp corrupts the next-page
// cursor. The canonical RPC may legitimately return null for an unpublished
// date, so preserve that case rather than making up a timestamp.
const publicationTime = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value) &&
    Number.isFinite(Date.parse(value)));
const badSearch = () => new Error('求人検索の結果を確認できませんでした。もう一度検索してください。');
const badFacets = () => new Error('求人の絞り込み条件を確認できませんでした。再読み込みしてください。');

/** Preserve the server's rows unchanged so rank/cursor and disclosure values are canonical. */
export function verifiedJobSearchRows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw badSearch();
  const seen = new Set<string>();
  let expectedTotal: number | null = null;
  let expectedHasMore: boolean | null = null;
  for (const item of data) {
    if (!row(item) || !text(item.id) || !UUID.test(item.id) ||
        !text(item.facility_id) || !UUID.test(item.facility_id) ||
        !text(item.facility_name) || !text(item.title) ||
        !numeric(item.rank_quality) || !numeric(item.rank_transparency) ||
        !('published_at' in item) || !publicationTime(item.published_at) ||
        count(item.total_count) === null || typeof item.has_more !== 'boolean') throw badSearch();
    const id = item.id.toLowerCase();
    if (seen.has(id)) throw badSearch();
    seen.add(id);
    const total = count(item.total_count)!;
    if (total < data.length || (item.has_more && total <= data.length) ||
        (expectedTotal !== null && total !== expectedTotal) ||
        (expectedHasMore !== null && item.has_more !== expectedHasMore)) throw badSearch();
    expectedTotal = total;
    expectedHasMore = item.has_more;
  }
  return data as T[];
}

/** The facets RPC returns zero or one record, never a successful null result. */
export function verifiedJobSearchFacets(data: unknown): { prefectures: string[]; employmentTypes: string[] } {
  if (!Array.isArray(data) || data.length > 1) throw badFacets();
  if (!data.length) return { prefectures: [], employmentTypes: [] };
  const result = data[0];
  if (!row(result) || !('prefectures' in result) || !('employment_types' in result)) throw badFacets();
  const prefectures = result.prefectures === null ? [] : result.prefectures;
  const employmentTypes = result.employment_types === null ? [] : result.employment_types;
  if (!Array.isArray(prefectures) || !Array.isArray(employmentTypes) ||
      !prefectures.every(text) || !employmentTypes.every(text)) throw badFacets();
  return { prefectures, employmentTypes };
}
