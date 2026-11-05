/**
 * Fail-closed presentation guards for jobseeker visits. They never replace the
 * canonical API/RLS check; callers must still pin the exact Clerk session.
 */
export function canRequestVisibleVisit(
  currentOwner: string | null,
  verifiedOwner: string | null,
  jobId: string | null,
  offeredTypes: readonly string[],
  selectedType: string,
  localDate: string,
  localTime: string,
): boolean {
  return Boolean(
    currentOwner && verifiedOwner === currentOwner &&
    jobId?.trim() && offeredTypes.includes(selectedType) &&
    localDate.trim() && localTime.trim(),
  );
}

export function canCancelVisibleVisit(
  currentOwner: string | null,
  verifiedOwner: string | null,
  visits: readonly { reservation_id: string; status: string }[] | null,
  reservationId: string,
): boolean {
  return Boolean(
    currentOwner && verifiedOwner === currentOwner &&
    visits?.some((visit) => visit.reservation_id === reservationId &&
      (visit.status === 'requested' || visit.status === 'confirmed')),
  );
}

export function visitReadbackConfirmsMutation(
  visits: readonly { reservation_id: string; status: string }[],
  reservationId: string,
  mutation: 'request' | 'cancel',
): boolean {
  const visit = visits.find((row) => row.reservation_id === reservationId);
  if (mutation === 'request') return Boolean(visit);
  // The canonical cancel API itself requires an explicit 'cancelled' state.
  return visit?.status === 'cancelled';
}
