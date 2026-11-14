/**
 * Present the Web comparison table's match emphasis and two-line verified evidence.
 * The evidence adapter already verified provenance and produced a user-safe label;
 * this formatter must never turn missing evidence into a positive claim.
 */
export type ComparisonCellPresentation = Readonly<{
  value: string;
  caption: string | null;
  emphasized: boolean;
}>;

export function comparisonConditionCell(score: number | null): ComparisonCellPresentation {
  if (score === null || !Number.isFinite(score) || score < 0 || score > 100) {
    return { value: '希望条件未設定', caption: null, emphasized: false };
  }
  return { value: `${score}%`, caption: null, emphasized: score >= 70 };
}

export function comparisonVerifiedCell(
  metric: Readonly<{ displayValue: string }> | null,
): ComparisonCellPresentation {
  if (!metric) return { value: '実績未公開', caption: null, emphasized: false };
  // The existing canonical verified adapter appends this exact locally composed
  // caption only if a nonnegative sample size was verified. Do not split
  // arbitrary employer text or invent a record count for absent samples.
  const captionMatch = /\n(\d+(?:件|か月分)の記録から集計)$/.exec(metric.displayValue);
  const value = captionMatch
    ? metric.displayValue.slice(0, -captionMatch[0].length)
    : metric.displayValue;
  return { value, caption: captionMatch?.[1] ?? null, emphasized: false };
}
