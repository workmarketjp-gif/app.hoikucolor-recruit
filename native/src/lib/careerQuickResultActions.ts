/** Presentation-only projection of the authorized career scenario RPC response.
 * The Web quick paths show at most three jobs and offer a nationwide retry
 * when a regional search is empty (or verified holiday data is insufficient).
 * No job, count or permission is inferred beyond the canonical response.
 */
type QuickResult =
  | { ready: false; missing: 'salary_line' | 'verified_holidays' }
  | { ready: true; total: number; jobs: readonly unknown[] };

export function careerQuickResultActions(
  result: QuickResult,
  prefecture: string,
  path: 'salary' | 'holidays',
): {
  locationLabel: string;
  previewCount: number;
  showWiden: boolean;
  moreLabel: string | null;
} {
  const region = prefecture.trim();
  const previewCount = result.ready ? Math.min(3, result.jobs.length) : 0;
  const showWiden = Boolean(region) && (
    result.ready ? result.jobs.length === 0 : path === 'holidays' && result.missing === 'verified_holidays'
  );
  const moreLabel = result.ready && result.jobs.length > 0
    ? result.total > previewCount
      ? `ほかの${result.total - previewCount}件も求人を探すで見る`
      : '求人を探すで、さらに見る'
    : null;
  return { locationLabel: region || '全国', previewCount, showWiden, moreLabel };
}
