/** Permit only reviewed, fixed Japanese messages across the generated-PDF boundary. */
const SAFE_MESSAGES = new Set([
  'プロフィールの閲覧権限を確認できませんでした。',
  '別の端末で履歴書が変更されました。最新データを読み込み直してください。',
  'PDFは10MB以下の有効なファイルを作成してください。',
  '作成された書類はPDF形式ではありません。',
  'PDFの作成が完了していません。もう一度作成してください。',
  '書類の保存結果を確認できませんでした。書類一覧を再読み込みしてください。',
  '応募時に使う書類の設定を確認できませんでした。',
]);

export const UNCONFIRMED_RESUME_PDF_NOTICE =
  'PDFを作成・保存できませんでした。書類が保存済みの可能性もあるため、応募書類一覧を確認してから操作してください。';

/** Raw Supabase/Storage/Clerk errors must never be rendered on a private screen. */
export function resumePdfFailureNotice(error: unknown): string {
  return error instanceof Error && SAFE_MESSAGES.has(error.message)
    ? error.message : UNCONFIRMED_RESUME_PDF_NOTICE;
}
