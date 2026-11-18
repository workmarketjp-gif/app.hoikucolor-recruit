/**
 * A successful private signed-URL response is a positive presence signal.
 * Errors, including 404/not_found, can reflect RLS or transport failures and
 * must NEVER be downgraded to "object absent" to authorize another write.
 * This is not a substitute for canonical document row/readback verification.
 */
export function requireStorageSignedUrlPresence(response: {
  data: { signedUrl?: string | null } | null;
  error: unknown | null;
}): true {
  if (response.error || typeof response.data?.signedUrl !== 'string' ||
      !response.data.signedUrl.trim()) {
    throw new Error('書類の保存状況を確認できませんでした。書類一覧を再読み込みして確認してください。');
  }
  return true;
}
