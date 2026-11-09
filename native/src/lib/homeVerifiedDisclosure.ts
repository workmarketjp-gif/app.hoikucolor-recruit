import type { VerifiedProfile } from './jobseekerCoreApi';

export type HomeEvidenceKind = 'workplace' | 'finance';
export type HomeEvidenceDisclosure = Readonly<{
  label: string;
  transparency: string | null;
  period: string | null;
  attribution: string;
  stabilityCaution: string | null;
}>;

/** Format verified RPC date bounds, never an inferred or unparseable period. */
function month(value: string | null | undefined): { order: number; label: string } | null {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return null;
  if (day !== undefined && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())) return null;
  return { order: year * 12 + month, label: `${year}年${month}月` };
}

/** Only verified, actually displayed values justify a trust badge. */
export function homeVerifiedDisclosure(
  profile: VerifiedProfile | null | undefined,
  kind: HomeEvidenceKind,
  visibleMetrics: readonly { key: string }[],
): HomeEvidenceDisclosure | null {
  if (!profile || !Number.isSafeInteger(profile.verified_metric_count) ||
      profile.verified_metric_count! <= 0 || visibleMetrics.length === 0) return null;
  const start = month(profile.period_start);
  const end = month(profile.period_end);
  const period = start && end && start.order <= end.order
    ? `集計期間 ${start.label}〜${end.label}` : null;
  const percentage = profile.transparency_pct;
  const transparency = typeof percentage === 'number' && Number.isFinite(percentage) &&
    percentage >= 0 && percentage <= 100 ? `情報公開率 ${Math.round(percentage)}%` : null;
  const finance = kind === 'finance';
  return {
    label: finance ? '✓ 会計実績あり' : '✓ 勤務実績あり',
    transparency,
    period,
    attribution: finance
      ? '園の申告ではなく確定した会計記録から集計'
      : '園の申告ではなく実際の勤務記録から集計',
    stabilityCaution: finance && visibleMetrics.some((metric) => metric.key === 'finance_monthly_result_stability')
      ? '月次収支安定性は、法人全体の信用力・支払能力・将来の経営継続を保証するものではありません。'
      : null,
  };
}
