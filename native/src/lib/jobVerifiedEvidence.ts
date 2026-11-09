import type { VerifiedProfile } from './jobseekerCoreApi';

/** Keep the same display priority as Web JobCard and VerifiedFinanceSummary. */
const WORKPLACE_METRICS = [
  'average_monthly_overtime_hours', 'paid_leave_usage_rate_pct',
  'average_tenure_years', 'average_monthly_saturday_shift_count',
  'nursery_teacher_ratio_pct', 'average_experience_years',
  'average_monthly_early_shift_count', 'average_monthly_late_shift_count',
  'full_time_ratio_pct', 'average_age_years',
] as const;

const FINANCE_METRICS = [
  'finance_monthly_result_stability', 'finance_budget_managed_months_12m',
  'finance_payroll_finalized_months_12m', 'finance_closed_months_12m',
  'finance_close_within_45_days_pct', 'finance_positive_month_ratio_pct',
  'finance_average_result_margin_pct',
] as const;

export type VerifiedMetricDisplay = {
  key: string;
  label: string;
  value: string;
  recordCount: number | null;
};

export type VerifiedEvidenceDisplay = {
  metrics: VerifiedMetricDisplay[];
  transparencyPercent: number | null;
  period: string | null;
};

function month(value: unknown): { order: number; label: string } | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const n = Number(match[2]);
  if (year < 1900 || year > 9999 || n < 1 || n > 12) return null;
  if (match[3] !== undefined) {
    const day = Number(match[3]);
    if (day < 1 || day > new Date(Date.UTC(year, n, 0)).getUTCDate()) return null;
  }
  return { order: year * 12 + n, label: `${year}年${n}月` };
}

/** Never promote missing or malformed evidence to "verified". */
export function verifiedEvidence(
  profile: VerifiedProfile | null | undefined,
  kind: 'workplace' | 'finance',
): VerifiedEvidenceDisplay | null {
  if (!profile || !Number.isSafeInteger(profile.verified_metric_count) ||
      (profile.verified_metric_count ?? 0) <= 0 || !profile.verified_metrics ||
      typeof profile.verified_metrics !== 'object') return null;
  const allowed = kind === 'workplace' ? WORKPLACE_METRICS : FINANCE_METRICS;
  const metrics: VerifiedMetricDisplay[] = [];
  for (const key of allowed) {
    const item = profile.verified_metrics[key];
    if (!item || typeof item.label !== 'string' || !item.label.trim()) continue;
    if ((item.source != null) && item.source !== (kind === 'workplace' ? 'ho_verified' : 'hf_verified')) continue;
    const raw = item.value;
    if (typeof raw !== 'number' && typeof raw !== 'string') continue;
    if (typeof raw === 'number' && !Number.isFinite(raw)) continue;
    if (typeof raw === 'string' && !raw.trim()) continue;
    const value = typeof raw === 'number' ? `${Number(raw.toFixed(1))}` : raw;
    metrics.push({
      key,
      label: item.label.trim(),
      value: `${value}${typeof item.unit === 'string' ? item.unit : ''}`,
      recordCount: typeof item.sample_size === 'number' && Number.isSafeInteger(item.sample_size) && item.sample_size >= 0
        ? item.sample_size : null,
    });
  }
  if (!metrics.length) return null;
  const transparency = profile.transparency_pct;
  const transparencyPercent = typeof transparency === 'number' && Number.isFinite(transparency) && transparency >= 0 && transparency <= 100
    ? Math.round(transparency) : null;
  const start = month(profile.period_start);
  const end = month(profile.period_end);
  return { metrics, transparencyPercent, period: start && end && start.order <= end.order
    ? `${start.label}〜${end.label}` : null };
}

/** Avoid both a made-up closure and accepting an already expired listing. */
export function jobIsClosed(closingAt: string | null | undefined, now: number): boolean {
  if (!closingAt) return false;
  const end = Date.parse(closingAt);
  return Number.isFinite(end) && end < now;
}
