import type { JobseekerJob, VerifiedProfile } from './jobseekerCoreApi';

export type JobCondition = Readonly<{ label: string; value: string }>;
export type EvidenceMetric = Readonly<{
  key: string;
  label: string;
  displayValue: string;
  sample: string | null;
}>;

/** Use only fields from the canonical job RPC. Missing declarations are omitted, not inferred. */
export function homeJobConditions(job: JobseekerJob): JobCondition[] {
  const entries: Array<[string, string | number | null | undefined]> = [
    ['園', job.facility_type ? `${job.facility_name}（${job.facility_type}）` : job.facility_name],
    ['所在地', job.address || [job.prefecture, job.city].filter(Boolean).join(' ')],
    ['雇用形態', job.employment_type],
    ['勤務時間', job.working_hours],
    ['休日', job.holidays],
    ['応募資格', job.required_qualification],
    ['待遇', job.benefits],
    ['募集人数', Number.isSafeInteger(job.number_of_positions) && job.number_of_positions >= 0
      ? `${job.number_of_positions}名` : null],
  ];
  return entries.flatMap(([label, value]) => (
    (typeof value === 'string' && value.trim()) || typeof value === 'number'
      ? [{ label, value: String(value) }]
      : []
  ));
}

const workplacePriority = [
  'average_monthly_overtime_hours', 'paid_leave_usage_rate_pct',
  'average_tenure_years', 'average_monthly_saturday_shift_count',
  'nursery_teacher_ratio_pct', 'average_experience_years',
  'average_monthly_early_shift_count', 'average_monthly_late_shift_count',
  'full_time_ratio_pct', 'average_age_years',
] as const;

/** A badge/count alone is not proof of any metric. Only actual RPC values are rendered. */
export function homeEvidenceMetrics(profile: VerifiedProfile | null | undefined, kind: 'workplace' | 'finance'): EvidenceMetric[] {
  if (!profile || typeof profile.verified_metric_count !== 'number' ||
      !Number.isFinite(profile.verified_metric_count) || profile.verified_metric_count <= 0 ||
      !profile.verified_metrics) return [];
  const values = profile.verified_metrics;
  const keys = kind === 'workplace'
    ? workplacePriority.filter((key) => Object.prototype.hasOwnProperty.call(values, key))
    : Object.keys(values).sort();
  const metrics: EvidenceMetric[] = [];
  for (const key of keys) {
    const metric = values[key];
    if (!metric || typeof metric.label !== 'string' || !metric.label.trim() ||
        (typeof metric.value !== 'number' && typeof metric.value !== 'string') ||
        (typeof metric.value === 'number' && !Number.isFinite(metric.value)) ||
        (typeof metric.value === 'string' && !metric.value.trim())) continue;
    const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value;
    metrics.push({
      key, label: metric.label, displayValue: `${value}${typeof metric.unit === 'string' ? metric.unit : ''}`,
      sample: typeof metric.sample_size === 'number' && Number.isSafeInteger(metric.sample_size) && metric.sample_size >= 0
        ? `${metric.sample_size}件の記録` : null,
    });
    if (metrics.length === 10) break;
  }
  return metrics;
}

/** Imported source metadata never creates a claim that a posting is verified. */
export function homeJobSource(job: JobseekerJob): string[] {
  if (!job.is_external) return [];
  const result = [];
  if (job.source_name?.trim()) result.push(`出典：${job.source_name}${job.source_job_id?.trim() ? `（求人番号 ${job.source_job_id}）` : ''}`);
  if (job.source_last_verified_at?.trim()) {
    const date = new Date(job.source_last_verified_at);
    const displayed = Number.isNaN(date.getTime()) ? job.source_last_verified_at
      : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    result.push(`最終確認 ${displayed}`);
  }
  return result;
}

/**
 * Preserve an explicit "unknown" when the canonical close date is unusable.
 * The Web's boolean JobCard check treats an invalid timestamp as "not closed",
 * but Native must not display an actionable inline application that its own
 * canonical preflight rejects. A valid, absent optional deadline is different
 * from a malformed deadline. This is presentation, never authorization.
 */
export type HomeJobAvailability = 'open' | 'closed' | 'unknown';

export function homeJobAvailability(job: JobseekerJob & { is_open?: boolean }, now: number): HomeJobAvailability {
  if (job.is_open === false) return 'closed';
  if (!Number.isFinite(now) || (job.is_open !== undefined && job.is_open !== true)) return 'unknown';
  if (job.closing_at == null) return 'open';
  if (typeof job.closing_at !== 'string' || !job.closing_at.trim()) return 'unknown';
  const end = Date.parse(job.closing_at);
  if (!Number.isFinite(end)) return 'unknown';
  return end < now ? 'closed' : 'open';
}

/** Compatibility for existing r107 status tests; Home uses the three-state version. */
export function homeJobIsClosed(job: JobseekerJob & { is_open?: boolean }, now: number): boolean {
  return homeJobAvailability(job, now) === 'closed';
}
