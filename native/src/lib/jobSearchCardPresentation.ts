import { verifiedEvidence } from './jobVerifiedEvidence.ts';
import type { VerifiedProfile } from './jobseekerCoreApi';

/**
 * Job-search summary uses the same authoritative evidence preview as Saved.
 * A positive count alone is insufficient to advertise verified records.
 */
export type JobSearchCardFacts = Readonly<{
  prefecture: string | null;
  city: string | null;
  employment_type: string | null;
  closing_at: string | null;
  is_open?: boolean;
  verified_workplace: VerifiedProfile | null;
  verified_finance: VerifiedProfile | null;
}>;

export function jobSearchCardPresentation(job: JobSearchCardFacts, now = Date.now()) {
  const location = [job.prefecture, job.city].filter(Boolean).join(' ') || '勤務地は詳細をご確認ください';
  const closesAt = job.closing_at === null ? NaN : Date.parse(job.closing_at);
  // A missing or invalid closing date cannot by itself prove that recruitment ended.
  const isClosed = job.is_open === false || (Number.isFinite(closesAt) && closesAt < now);
  return {
    location: `${location}${job.employment_type ? ` ・ ${job.employment_type}` : ''}`,
    isClosed,
    hasVerifiedWorkplace: verifiedEvidence(job.verified_workplace, 'workplace') !== null,
    hasVerifiedFinance: verifiedEvidence(job.verified_finance, 'finance') !== null,
  };
}
