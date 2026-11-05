/**
 * Jobseeker application event presentation from Web ApplicationDetail.tsx.
 * Presentation labels are not authoritative state transitions; the canonical
 * application/visit RPCs and candidate RLS still govern every operation.
 * Web source: main fa779e73b324d07c2a2b10ec0c5e7ea71bd283a6.
 */
const INTERVIEW_STATUS: Readonly<Record<string, string>> = {
  scheduled: '予定',
  completed: '完了',
  cancelled: 'キャンセル',
  no_show: '未実施',
};

const APPLICATION_VISIT_STATUS: Readonly<Record<string, string>> = {
  requested: '確認中',
  confirmed: '確定',
  declined: '日程調整不可',
  cancelled: 'キャンセル',
  completed: '参加済み',
  no_show: '未参加',
};

const EXPERIENCE_TYPE: Readonly<Record<string, string>> = {
  visit: '園見学',
  half_day_trial: '半日体験',
  full_day_trial: '1日体験',
};

export function interviewStatusLabel(status: string): string {
  return INTERVIEW_STATUS[status] ?? '状態を確認できません';
}

export function applicationVisitStatusLabel(status: string): string {
  return APPLICATION_VISIT_STATUS[status] ?? '状態を確認できません';
}

export function applicationVisitExperienceLabel(type: string): string {
  return EXPERIENCE_TYPE[type] ?? '体験種別を確認できません';
}

/** Explicit Japan timezone prevents device locale/roaming changing event times. */
export function formatApplicationEventDateTimeJapan(value: string | null): string {
  if (!value) return '日時未設定';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '日時未設定';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

/** A local guard only: server rights, current session, and durable RPC still decide. */
export function canSubmitInterviewResponse(
  interview: { status: string; candidate_response_status: string | null },
  responseStatus: 'accepted' | 'reschedule_requested',
  candidateMessage: string,
): boolean {
  if (interview.status !== 'scheduled') return false;
  if (responseStatus === 'accepted') return interview.candidate_response_status !== 'accepted';
  return candidateMessage.trim().length > 0;
}
