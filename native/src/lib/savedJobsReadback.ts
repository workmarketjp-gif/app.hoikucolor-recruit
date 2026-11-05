/**
 * Presentation-only guard. Candidate authorization is always performed by
 * canonical RPC/RLS with a session-pinned client, not by this helper.
 */
export function canCommitSavedJobsView(
  requestOwner: string | null,
  currentOwner: string | null,
  requestGeneration: number,
  currentGeneration: number,
  privateVisible: boolean,
): boolean {
  return Boolean(requestOwner) && requestOwner === currentOwner &&
    requestGeneration === currentGeneration && privateVisible;
}

/**
 * An RPC acknowledgement is not sufficient to claim that a saved job was
 * removed. Return the latest canonical rows, or fail without optimistic UI.
 */
export async function removeSavedJobAndConfirm<T extends { id: string }>(
  jobId: string,
  removeCanonical: () => Promise<void>,
  rereadCanonical: () => Promise<T[]>,
): Promise<T[]> {
  await removeCanonical();
  const rows = await rereadCanonical();
  if (!Array.isArray(rows) ||
      !rows.every((row) => row && typeof row.id === 'string') ||
      rows.some((row) => row.id === jobId)) {
    throw new Error('保存結果を確認できませんでした。更新してご確認ください。');
  }
  return rows;
}
