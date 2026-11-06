/** Native-only presentation and input rules mirrored from the current Web scout panels. */
export type ScoutNumericInput = {
  monthlySalaryText: string;
  hourlyWageText: string;
  commuteText: string;
  availableTimeFrom: string | null;
  availableTimeTo: string | null;
};

type ValidatedScoutNumericInput = {
  desired_monthly_salary_min: number | null;
  desired_hourly_wage_min: number | null;
  max_commute_minutes: number | null;
};

type ScoutInputResult =
  | { ok: true; values: ValidatedScoutNumericInput }
  | { ok: false; error: string };

/** Accept integer form values only; Number('')/Number('1e3') must not silently change intent. */
function nonnegativeInteger(text: string): number | null | undefined {
  const input = text.trim();
  if (!input) return null;
  if (!/^\d+$/.test(input)) return undefined;
  const value = Number(input);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isWebTimeInput(value: string | null): boolean {
  return !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateScoutNumericInput(input: ScoutNumericInput): ScoutInputResult {
  const monthly = nonnegativeInteger(input.monthlySalaryText);
  const hourly = nonnegativeInteger(input.hourlyWageText);
  const commute = nonnegativeInteger(input.commuteText);
  if (monthly === undefined || hourly === undefined) {
    return { ok: false, error: '希望月給・時給は0以上の整数で入力してください。' };
  }
  if (commute === undefined || (commute !== null && (commute < 1 || commute > 300))) {
    return { ok: false, error: '通勤時間は1〜300分の整数で入力してください。' };
  }
  const from = input.availableTimeFrom?.trim() || null;
  const to = input.availableTimeTo?.trim() || null;
  if (!isWebTimeInput(from) || !isWebTimeInput(to)) {
    return { ok: false, error: '勤務可能時間は「08:00」の形式で入力してください。' };
  }
  if (from && to && from >= to) {
    return { ok: false, error: '勤務可能時間は、開始時刻を終了時刻より前にしてください。' };
  }
  return { ok: true, values: {
    desired_monthly_salary_min: monthly,
    desired_hourly_wage_min: hourly,
    max_commute_minutes: commute,
  } };
}

export type ScoutStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

const labels: Record<ScoutStatus, string> = {
  pending: '回答待ち',
  accepted: '承諾済み',
  declined: '辞退済み',
  cancelled: '取り消し',
  expired: '期限切れ',
};

export function scoutStatusLabel(status: ScoutStatus): string {
  return labels[status];
}

export function scoutResponseNote(status: ScoutStatus): string | null {
  if (status === 'accepted') return '承諾済みです。園からの連絡をお待ちください。';
  if (status === 'declined') return '辞退済みです。本人情報は共有されません。';
  if (status === 'expired') return '回答期限を過ぎています。本人情報は共有されません。';
  return null;
}

export function formatScoutDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function scoutJobLine(jobTitle: string | null | undefined, employmentType: string | null | undefined): string {
  if (!jobTitle && !employmentType) return '';
  return (jobTitle || '募集職種') + (employmentType ? ' ・ ' + employmentType : '');
}
