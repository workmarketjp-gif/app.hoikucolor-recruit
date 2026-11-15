// Structural read-only projection of careerApi.ts's canonical response.
// No new RPC, schema, authorization rule or derived market data is introduced.
type ScenarioResult =
  | { ready: false; missing: 'salary_line' | 'verified_holidays'; unknown_holidays?: number }
  | { ready: true; total: number; unknown_holidays: number; jobs: readonly unknown[] };
type Scenario = 'keep-income' | 'more-holidays' | 'balance';

/**
 * Mirrors the candidate Web /career ScenarioResult disclosures. The canonical RPC
 * owns the results and counts; this helper only formats already-returned facts.
 * Never infer missing holiday totals or turn a missing input into a zero-result search.
 */
export function careerScenarioPresentation(result: ScenarioResult, scenario: Scenario): {
  unavailable: { title: string; description: string } | null;
  empty: { title: string; description: string } | null;
  unknownHolidays: string | null;
  extraCount: string | null;
} {
  if (!result.ready) {
    return {
      unavailable: result.missing === 'salary_line'
        ? {
          title: '入力すると表示されます',
          description: scenario === 'more-holidays'
            ? '今の月給を入力してください。'
            : '今の月給か、希望の最低月給を入力してください。',
        }
        : {
          title: '年間休日が確認できた求人が、まだ足りません',
          description: '年間休日の日数が求人票に書かれている求人が少ないため、この並べ方は表示しません。'
            + (result.unknown_holidays ? `（確認できない求人 ${result.unknown_holidays}件）` : ''),
        },
      empty: null, unknownHolidays: null, extraCount: null,
    };
  }
  return {
    unavailable: null,
    empty: result.jobs.length === 0 ? {
      title: '条件に合う求人は見つかりませんでした',
      description: '下がってもよい月給や希望の休日、地域を少しゆるめると見つかることがあります。',
    } : null,
    unknownHolidays: result.unknown_holidays > 0
      ? `年間休日が確認できない${result.unknown_holidays}件は、休日の順位に入れていません`
      : null,
    extraCount: result.total > result.jobs.length
      ? `ほかに${result.total - result.jobs.length}件あります。気になる条件が決まったら「求人を探す」で絞り込めます。`
      : null,
  };
}
