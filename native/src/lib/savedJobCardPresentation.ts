import { verifiedEvidence } from './jobVerifiedEvidence.ts';
import { canOpenCandidateVisit } from './candidateVisitEntry.ts';
import type { VerifiedProfile } from './jobseekerCoreApi';

/**
 * Presentation of a canonical saved-job RPC row, not authorization or a job
 * status cache. Reference: Web src/App.tsx SavedView / JobCard.tsx.
 * All saved/search/detail/compare evidence badges share one eligibility rule.
 */
export type SavedJobCardSource = {
  is_open: boolean;
  closing_at: string | null;
  is_external?: boolean;
  can_apply_direct?: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_type: string | null;
  salary_note: string | null;
  prefecture: string | null;
  city: string | null;
  employment_type: string | null;
  verified_workplace?: VerifiedProfile | null;
  verified_finance?: VerifiedProfile | null;
};
export type SavedJobCardPresentation = {
  salary: string;
  location: string;
  employmentType: string | null;
  closed: boolean;
  directApply: boolean;
  canVisit: boolean;
  hasWorkplaceEvidence: boolean;
  hasFinanceEvidence: boolean;
};
/** Preserve record units from the canonical evidence source, as in Compare. */
export function savedEvidenceRecordLabel(kind: 'workplace' | 'finance', count: number): string | null {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return `${count}${kind === 'finance' ? 'か月分' : '件'}の記録`;
}
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
function salary(job: SavedJobCardSource): string {
  const min = positive(job.salary_min) ? job.salary_min : null;
  const max = positive(job.salary_max) ? job.salary_max : null;
  const unit = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : '月給';
  let range: string | null = null;
  if (min !== null) {
    const start = unit + ' ' + min.toLocaleString('ja-JP');
    range = max === null ? start + '円〜' : max === min
      ? start + '円' : start + '〜' + max.toLocaleString('ja-JP') + '円';
  }
  // Web prioritizes structured wage when an imported note lacks its unit.
  if (job.is_external && range) return range;
  return job.salary_note?.trim() || range || '給与は詳細をご確認ください';
}
export function presentSavedJobCard(job: SavedJobCardSource, now: number): SavedJobCardPresentation {
  const expiry = typeof job.closing_at === 'string' ? Date.parse(job.closing_at) : NaN;
  const closed = job.is_open === false || Number.isFinite(expiry) && expiry < now;
  return {
    salary: salary(job),
    location: [job.prefecture?.trim(), job.city?.trim()].filter(Boolean).join(' ') || '勤務地は詳細をご確認ください',
    employmentType: job.employment_type?.trim() || null,
    closed,
    directApply: !closed && job.is_external !== true && job.can_apply_direct !== false,
    canVisit: canOpenCandidateVisit(job, now),
    hasWorkplaceEvidence: verifiedEvidence(job.verified_workplace, 'workplace') !== null,
    hasFinanceEvidence: verifiedEvidence(job.verified_finance, 'finance') !== null,
  };
}
