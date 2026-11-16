/**
 * Safe user-facing failures for private candidate document operations.
 * RPC/Storage/native-picker errors may contain signed URLs, file paths,
 * candidate IDs or authorization material. Never interpolate raw errors.
 * Explicitly allowlist only known client-side file validation messages.
 */
export type DocumentVaultErrorOperation = 'read' | 'prepare' | 'upload' | 'camera' | 'open' | 'default' | 'delete';

const SAFE_FILE_VALIDATION = new Set([
  'PDF、JPEG、PNGのみ保存できます。',
  '書類は10MB以下のファイルを選択してください。',
  'ファイル内容と形式が一致しません。PDF、JPEG、PNGを選択してください。',
]);

export function presentDocumentVaultError(operation: DocumentVaultErrorOperation, cause: unknown): string {
  if (operation === 'prepare' || operation === 'upload' || operation === 'camera') {
    // No duck typing or string coercion: third-party error objects are untrusted.
    if (cause instanceof Error && SAFE_FILE_VALIDATION.has(cause.message)) return cause.message;
  }
  switch (operation) {
    case 'read': return '応募書類を読み込めませんでした。通信状態を確認し、再読み込みしてください。';
    case 'prepare': return '書類の準備に失敗しました。もう一度選択してください。';
    case 'upload': return '書類の保存結果を確認できませんでした。書類一覧を再確認してください。';
    case 'camera': return '撮影書類の保存結果を確認できませんでした。書類一覧を再確認してください。';
    case 'open': return '書類を安全に開けませんでした。通信状態を確認し、もう一度お試しください。';
    case 'default': return '既定書類の変更結果を確認できませんでした。書類一覧を再確認してください。';
    case 'delete': return '書類の削除結果を確認できませんでした。書類一覧を再確認してください。';
  }
}
