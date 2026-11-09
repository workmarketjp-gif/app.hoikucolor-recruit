import type { JobseekerJob, VerifiedProfile } from './jobseekerCoreApi';
import { verifiedEvidence } from './jobVerifiedEvidence.ts';

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

/** Keep the Home evidence card on the same approved metric list, source gate and
 * metric ordering as the Web-equivalent Native job detail. Finance samples
 * represent months, whereas workplace samples represent individual records.
 * Explicitly declared/conflicting provenance is never presented as verified.
 * Older verified RPC rows without a per-metric source remain compatible.
 */
export function homeEvidenceMetrics(profile: VerifiedProfile | null | undefined, kind: 'workplace' | 'finance'): EvidenceMetric[] {
  const verified = verifiedEvidence(profile, kind);
  if (!verified) return [];
  const sampleUnit = kind === 'finance' ? 'か月分の記録' : '件の記録';
  return verified.metrics.map((metric) => ({
    key: metric.key,
    label: metric.label,
    displayValue: metric.value,
    sample: metric.recordCount === null ? null : `${metric.recordCount}${sampleUnit}`,
  }));
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
 * from a malformed deadline. The authenticated v2 search/get-job RPCs do not
 * return is_open; the separately authorized saved-jobs RPC explicitly does.
 * If is_open is absent, accept only the exact v2 source identity/eligibility
 * pair instead of assuming an arbitrary partial object is open. This is a
 * presentation guard, never a replacement for server-side authorization.
 */
export type HomeJobAvailability = 'open' | 'closed' | 'unknown';

export function homeJobAvailability(job: JobseekerJob & { is_open?: boolean }, now: number): HomeJobAvailability {
  if (job.is_open === false) return 'closed';
  const source = job.source_kind;
  const canonicalLiveFeed = job.is_open === undefined && typeof source === 'string' && (
    (source === 'hoiku_color' && job.is_external === false && job.can_apply_direct === true) ||
    (source.trim().length > 0 && source !== 'hoiku_color' &&
      job.is_external === true && job.can_apply_direct === false)
  );
  if (!Number.isFinite(now) || (job.is_open !== true && !canonicalLiveFeed)) return 'unknown';
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
