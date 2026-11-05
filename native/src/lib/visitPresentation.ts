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

/** Labels and ordering mirror Web src/views/VisitsView.tsx (main fa779e73). */
const VISIT_STATUS_LABELS: Readonly<Record<string, string>> = {
  requested: '日程調整中',
  confirmed: '確定',
  declined: '日程調整不可',
  cancelled: 'キャンセル',
  completed: '完了',
  no_show: '未参加',
};

export function visitStatusLabel(status: string): string {
  return VISIT_STATUS_LABELS[status] ?? '状態を確認できません';
}

export function partitionVisitHistory<T extends { status: string; starts_at: string; reservation_id: string }>(
  visits: readonly T[],
  focusedReservationId: string | null,
): { active: T[]; history: T[] } {
  const active: T[] = [];
  const history: T[] = [];
  for (const visit of visits) {
    (visit.status === 'requested' || visit.status === 'confirmed' ? active : history).push(visit);
  }
  const sortableTime = (value: string) => {
    const n = new Date(value).getTime();
    return Number.isFinite(n) ? n : 0;
  };
  active.sort((a, b) => sortableTime(a.starts_at) - sortableTime(b.starts_at));
  history.sort((a, b) => sortableTime(b.starts_at) - sortableTime(a.starts_at));
  if (focusedReservationId) {
    // Native cannot scroll a DOM anchor; promote the deep-linked record only.
    for (const list of [active, history]) {
      const index = list.findIndex((visit) => visit.reservation_id === focusedReservationId);
      if (index > 0) list.unshift(list.splice(index, 1)[0]);
    }
  }
  return { active, history };
}

export function formatVisitDateTimeJapan(value: string | null): string {
  if (!value) return '日時未設定';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '日時未設定';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
