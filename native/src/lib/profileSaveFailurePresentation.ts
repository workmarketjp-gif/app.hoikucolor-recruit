/**
 * A failed pre-write Clerk/Supabase step may include private metadata in an
 * error object. Only our own known client validation messages may be shown.
 * Post-write uncertainty is handled separately by the canonical reload gate.
 */
const safeValidationMessages = new Set([
  '経験年数は0〜80の数字で入力してください。',
  'お名前を入力してください。',
  '勤務開始希望日はYYYY-MM-DD形式で入力してください。',
  '勤務開始希望日を確認してください。',
]);

export function presentProfilePrewriteFailure(localValidationMessage: string | null): string {
  if (localValidationMessage !== null && safeValidationMessages.has(localValidationMessage)) {
    return localValidationMessage;
  }
  return 'プロフィールの保存準備ができませんでした。ログイン状態・通信状態を確認して再度お試しください。';
}
