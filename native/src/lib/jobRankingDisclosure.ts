/** Matches the public Web RankingDisclosure organic position labels.
 * Position describes order in the currently displayed result list; it is not
 * a candidate matching score, a recommendation or proof of verified metrics.
 */
export type OrganicJobRankLabel = { text: string; ariaLabel: string };
export function organicJobRankLabels(ids: readonly string[], deepLinkedJobId: string | null = null): OrganicJobRankLabel[] {
  let position = 0;
  return ids.map((id) => {
    if (deepLinkedJobId && deepLinkedJobId === id) {
      return { text: '指定求人', ariaLabel: 'Google求人などから指定された求人' };
    }
    position += 1;
    return { text: `表示順 ${position}`, ariaLabel: `検索結果の表示順 ${position}番目` };
  });
}
