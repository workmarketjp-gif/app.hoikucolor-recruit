import type { JobseekerJob } from './jobseekerCoreApi';
import { verifiedEvidence } from './jobVerifiedEvidence.ts';

type ComparedEvidence = Pick<JobseekerJob, 'verified_workplace' | 'verified_finance'>;

/**
 * Compare cells must obey the same display eligibility as job detail/cards.
 * Never turn a bare verified count, malformed data or a declared metric into
 * a published workplace/finance record. The server/RLS remains authoritative.
 */
export function comparisonVerifiedMetric(
  job: ComparedEvidence,
  kind: 'workplace' | 'finance',
  key: string,
): { label: string; displayValue: string } | null {
  const profile = kind === 'workplace' ? job.verified_workplace : job.verified_finance;
  const metric = verifiedEvidence(profile, kind)?.metrics.find((entry) => entry.key === key);
  if (!metric) return null;
  const sample = metric.recordCount === null ? '' :
    `\n${metric.recordCount}${kind === 'finance' ? 'か月分' : '件'}の記録から集計`;
  return { label: metric.label, displayValue: `${metric.value}${sample}` };
}
