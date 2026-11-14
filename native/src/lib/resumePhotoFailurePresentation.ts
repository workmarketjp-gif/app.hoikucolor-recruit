/**
 * OS image pickers, manipulation and filesystem modules can put paths,
 * internal IDs or untrusted metadata in Error.message. Never render those
 * raw failures on a candidate's private resume screen.
 *
 * Unknown failures can happen after a cache write. Do not imply a successful
 * save/delete or retry a write automatically.
 */
const SAFE_RESUME_PHOTO_MESSAGES = new Set([
  '写真を確認できませんでした。もう一度選んでください。',
  '写真の一時ファイルを安全に確認できませんでした。',
  '写真の一時ファイルを削除できませんでした。',
  '写真を600×800に整えられませんでした。もう一度選んでください。',
  '写真はJPEGまたはPNGの画像を選んでください。',
  '透過のあるPNGは使えません。JPEGの写真、または背景が透過していない画像を選んでください。',
  '写真を安全に読み込めませんでした。もう一度選んでください。',
  '写真は10MB以下の画像を選んでください。',
  '写真の内容と画像形式が一致しません。',
  '写真のサイズを確認できませんでした。',
  '写真を加工できませんでした。もう一度選んでください。',
  '証明写真の端末保存を確認できませんでした。',
  '保存された証明写真を確認できませんでした。もう一度選んでください。',
]);

export const UNCONFIRMED_RESUME_PHOTO_NOTICE =
  '証明写真を処理できませんでした。端末内の保存状態を確認できないため、入力内容を保存してから画面を再読み込みしてください。';

/** Presentation only: never let raw exceptions cross the photo UI boundary. */
export function resumePhotoFailureNotice(cause: unknown): string {
  try {
    if (cause instanceof Error && SAFE_RESUME_PHOTO_MESSAGES.has(cause.message)) {
      return cause.message;
    }
  } catch {
    // A malformed third-party Error subclass may throw from its getter.
  }
  return UNCONFIRMED_RESUME_PHOTO_NOTICE;
}

export const UNCONFIRMED_RESUME_PHOTO_REMOVAL_NOTICE =
  '証明写真の削除結果を確認できませんでした。写真が端末に残っているか、画面を再読み込みして確認してください。';

/** A failed physical delete might already have removed the file. Quarantine stale previews. */
export function resumePhotoRemovalFailureDecision(): { preview: null; notice: string } {
  return { preview: null, notice: UNCONFIRMED_RESUME_PHOTO_REMOVAL_NOTICE };
}
