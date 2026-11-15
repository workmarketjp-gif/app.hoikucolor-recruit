/** Same terminal application statuses as the signed-in Web Home (src/App.tsx). */
const CLOSED_WEB_APPLICATION_STATUSES = new Set(['rejected', 'withdrawn', 'hired']);

/** Called only after the owner-pinned canonical list RPC has verified each row. */
export function homeInProgressApplicationCount(rows: readonly { status: string }[]): number {
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.status !== 'string')) {
    throw new Error('応募状況を確認できませんでした。');
  }
  return rows.filter((row) => !CLOSED_WEB_APPLICATION_STATUSES.has(row.status)).length;
}
