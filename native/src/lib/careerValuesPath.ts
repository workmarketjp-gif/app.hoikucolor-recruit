/**
 * The jobseeker Web values path has two distinct states. Selected values are
 * candidate-authored preferences, not verification or a matching result.
 * Preserve the canonical list and never offer a matching CTA before selection.
 */
export function careerValuesPath(values: readonly string[]): {
  values: readonly string[];
  introduction: string;
  primaryLabel: string;
  primaryRoute: '/matches' | '/scouts';
  secondaryLabel: string | null;
} {
  if (values.length === 0) {
    return {
      values,
      introduction: 'どんな保育をしたいかを選ぶと、考え方が近い園から順に見られます。選ぶのは数個で、あとから変えられます。',
      primaryLabel: '大切にしたい保育を選ぶ',
      primaryRoute: '/scouts',
      secondaryLabel: null,
    };
  }
  return {
    values,
    introduction: 'あなたが大切にしたい保育です。',
    primaryLabel: '保育観に合う求人を見る',
    primaryRoute: '/matches',
    secondaryLabel: '大切にしたい保育を見直す',
  };
}
