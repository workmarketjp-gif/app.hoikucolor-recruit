/**
 * Keep the Native candidate profile's pre-submit rules aligned with the
 * authorized jobseeker Web form. This is input validation, not authorization:
 * the session-pinned RPC and its RLS still decide what is saved.
 * The Web form requires a name and exposes a date-only input; do not send
 * an impossible or locale-dependent date from Native's editable text field.
 */
export function profileWebValidationError(
  name: string | null | undefined,
  desiredStartDate: string | null | undefined,
): string | null {
  if (typeof name !== 'string' || !name.trim()) {
    return 'お名前を入力してください。';
  }
  if (desiredStartDate == null || desiredStartDate.trim() === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredStartDate)) {
    return '勤務開始希望日はYYYY-MM-DD形式で入力してください。';
  }
  const year = Number(desiredStartDate.slice(0, 4));
  const month = Number(desiredStartDate.slice(5, 7));
  const day = Number(desiredStartDate.slice(8, 10));
  if (year < 1 || month < 1 || month > 12) {
    return '勤務開始希望日を確認してください。';
  }
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day < 1 || day > daysInMonth) {
    return '勤務開始希望日を確認してください。';
  }
  return null;
}
