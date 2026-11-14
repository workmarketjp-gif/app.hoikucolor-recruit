/**
 * A résumé RPC can commit even when its response or subsequent canonical read
 * fails. Once the RPC may have started, only an explicit, recognized server
 * rejection is safe to correct by editing; everything else requires a fresh
 * candidate-owned canonical reload before another write.
 *
 * Never display a Supabase/Clerk exception verbatim: error text can contain
 * database internals, document paths, or candidate identifiers.
 */
export type ResumeSaveFailureDecision = {
  notice: string;
  requiresReload: boolean;
};

const INPUT_REJECTIONS = new Set([
  '文字数が多すぎる項目があります。短くしてから保存してください。',
  '生年月日を確認してください。',
]);

export const UNCONFIRMED_RESUME_SAVE_NOTICE =
  '保存結果を確認できませんでした。自動で再送信せず、最新の履歴書を読み込んでください。';

export function resumeSaveFailureDecision(cause: unknown, writeStarted: boolean): ResumeSaveFailureDecision {
  if (!writeStarted) {
    return {
      notice: '保存前のログイン確認に失敗しました。再送信せず、状態を確認してから最新の履歴書を読み込んでください。',
      requiresReload: false,
    };
  }
  try {
    if (cause instanceof Error) {
      if (cause.name === 'ResumeRevisionConflict') {
        return { notice: '別の画面や端末で先に保存されました。最新の内容を読み込み直してください。', requiresReload: true };
      }
      if (cause.name === 'ResumeReadbackUnconfirmed') {
        return { notice: UNCONFIRMED_RESUME_SAVE_NOTICE, requiresReload: true };
      }
      if (INPUT_REJECTIONS.has(cause.message)) {
        return { notice: cause.message, requiresReload: false };
      }
      if (cause.message === '退会手続き中のため保存できません。') {
        return { notice: '退会手続き中のため保存できません。', requiresReload: true };
      }
    }
  } catch {
    // An untrusted Error subclass may throw from its name/message getter.
  }
  return { notice: UNCONFIRMED_RESUME_SAVE_NOTICE, requiresReload: true };
}
