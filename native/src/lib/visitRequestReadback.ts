/**
 * Exact canonical readback of a newly requested candidate visit. The server
 * still owns reservation authorization, RLS and the final booking rules.
 * A matching reservation UUID alone does NOT prove the submitted details.
 */
export type RequestedVisitExpectation = {
  reservationId: string;
  jobId: string;
  applicationId: string | null;
  experienceType: 'visit' | 'half_day_trial' | 'full_day_trial';
  localDate: string;
  localTime: string;
  candidateMessage: string | null;
};

type CanonicalVisitRow = {
  reservation_id: string;
  job_id: string;
  application_id: string | null;
  experience_type: string;
  starts_at: string;
  status: string;
  candidate_message: string | null;
};

function tokyoBookingDateTime(isoInstant: string): { date: string; time: string } | null {
  // Supabase timestamptz must include an explicit UTC offset. Never interpret
  // a zone-less timestamp according to the candidate's device timezone.
  if (typeof isoInstant !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(isoInstant)) return null;
  const instant = new Date(isoInstant);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const date = [value('year'), value('month'), value('day')].join('-');
  const time = [value('hour'), value('minute')].join(':');
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)
    ? { date, time } : null;
}

/** No candidate data is returned or logged; only a strict boolean proof. */
export function confirmsRequestedVisit(
  visits: readonly CanonicalVisitRow[],
  expected: RequestedVisitExpectation,
): boolean {
  const matching = visits.filter((visit) => visit.reservation_id === expected.reservationId);
  if (matching.length !== 1) return false;
  const visit = matching[0];
  const local = tokyoBookingDateTime(visit.starts_at);
  if (!local || !/^\d{4}-\d{2}-\d{2}$/.test(expected.localDate) ||
      !/^\d{2}:\d{2}$/.test(expected.localTime)) return false;
  return visit.job_id === expected.jobId &&
    visit.application_id === expected.applicationId &&
    visit.experience_type === expected.experienceType &&
    (visit.status === 'requested' || visit.status === 'confirmed') &&
    visit.candidate_message === expected.candidateMessage &&
    local.date === expected.localDate && local.time === expected.localTime;
}
