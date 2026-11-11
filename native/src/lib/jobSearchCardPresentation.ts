/**
 * Native job-search summary mirrors the current Web JobCard's visible identity,
 * location and evidence labels. These are presentation facts only: the server
 * remains authoritative for availability, saved state and application rights.
 */
export type JobSearchCardFacts = Readonly<{
  prefecture: string | null;
  city: string | null;
  employment_type: string | null;
  closing_at: string | null;
  is_open?: boolean;
  verified_workplace: { verified_metric_count?: number } | null;
  verified_finance: { verified_metric_count?: number } | null;
}>;

export function jobSearchCardPresentation(job: JobSearchCardFacts, now = Date.now()) {
  const location = [job.prefecture, job.city].filter(Boolean).join(' ') || '勤務地は詳細をご確認ください';
  const closesAt = job.closing_at === null ? NaN : Date.parse(job.closing_at);
  // A missing or invalid closing date cannot by itself prove that recruitment ended.
  const isClosed = job.is_open === false || (Number.isFinite(closesAt) && closesAt < now);
  return {
    location: `${location}${job.employment_type ? ` ・ ${job.employment_type}` : ''}`,
    isClosed,
    hasVerifiedWorkplace: Number(job.verified_workplace?.verified_metric_count ?? 0) > 0,
    hasVerifiedFinance: Number(job.verified_finance?.verified_metric_count ?? 0) > 0,
  };
}
