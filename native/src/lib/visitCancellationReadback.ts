/**
 * Fail-closed candidate visit cancellation proof. Both snapshots must originate
 * from the existing candidate-scoped canonical history RPC; this helper does
 * not grant authorization and never sends a mutation.
 */
type CanonicalVisit = {
  reservation_id: string;
  job_id: string;
  application_id: string | null;
  experience_type: string;
  starts_at: string;
  ends_at: string;
  candidate_message: string | null;
  created_at: string;
  updated_at: string;
  status: string;
  cancelled_at: string | null;
};

const active = (status: string) => status === 'requested' || status === 'confirmed';

/** Require one candidate-owned active record before issuing a cancel RPC. */
export function candidateMayCancelVisit(
  rows: readonly CanonicalVisit[],
  reservationId: string,
): boolean {
  const matches = rows.filter((row) => row.reservation_id === reservationId);
  return matches.length === 1 && active(matches[0].status) && matches[0].cancelled_at === null;
}

/**
 * The post-RPC row must represent the exact booking the candidate attempted to
 * cancel, not just a coincidentally cancelled reservation ID. No auto-retry on
 * ambiguous results: the UI must load canonical history before further action.
 */
export function confirmsCandidateVisitCancellation(
  beforeRows: readonly CanonicalVisit[],
  afterRows: readonly CanonicalVisit[],
  reservationId: string,
): boolean {
  if (!candidateMayCancelVisit(beforeRows, reservationId)) return false;
  const before = beforeRows.find((row) => row.reservation_id === reservationId)!;
  const matches = afterRows.filter((row) => row.reservation_id === reservationId);
  if (matches.length !== 1) return false;
  const after = matches[0];
  if (after.status !== 'cancelled' || after.cancelled_at === null) return false;
  const cancelledAt = Date.parse(after.cancelled_at);
  if (!Number.isFinite(cancelledAt) || cancelledAt < Date.parse(before.created_at) ||
      Date.parse(after.updated_at) < cancelledAt) return false;
  return after.job_id === before.job_id &&
    after.application_id === before.application_id &&
    after.experience_type === before.experience_type &&
    after.starts_at === before.starts_at &&
    after.ends_at === before.ends_at &&
    after.candidate_message === before.candidate_message &&
    after.created_at === before.created_at;
}
