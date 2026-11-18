/**
 * Two-phase jobseeker-vault deletion response guard.
 *
 * The owner-scoped hc_finalize_jobseeker_document_delete RPC checks the
 * Storage object's absence in storage.objects BEFORE removing the candidate
 * document row; a successful boolean true is therefore the authoritative
 * completion signal. A Storage.remove network error is not evidence the
 * object survived: it may have been removed before the response was lost.
 *
 * Web src/lib/documentVaultRepository.ts uses the same precedence. Native
 * callers still need a current authenticated owner and canonical list
 * readback before showing success; this does not replace server RLS.
 */
export function confirmJobseekerVaultDeletion(options: {
  storageRemoveError: unknown;
  finalizeError: unknown;
  finalized: unknown;
}): void {
  const { storageRemoveError, finalizeError, finalized } = options;
  if (!finalizeError && finalized === true) return;
  if (storageRemoveError) {
    // A failed/ambiguous finalize must NOT claim the database row remains,
    // promise a safe automatic retry, or report successful deletion.
    throw new Error('元ファイルの削除結果を確認できませんでした。書類一覧を再読み込みして状態を確認してください。');
  }
  if (finalizeError) throw finalizeError;
  throw new Error('書類の削除を完了できませんでした。書類一覧を再読み込みして状態を確認してください。');
}
