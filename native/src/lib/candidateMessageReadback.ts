/**
 * The candidate-only SQL RPC returns an array of rows, including [] when a
 * private thread has no messages. A null/partial response must never be
 * interpreted as "no messages" or clear an ambiguous-send safety gate.
 * Authorization is still enforced by the existing server RPC, not this check.
 */
export type CandidateMessageReadbackRow = Readonly<{
  id: string;
  thread_id: string;
  sender_role: 'jobseeker' | 'facility';
  body: string;
  created_at: string;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifiedCandidateMessageRows(data: unknown): CandidateMessageReadbackRow[] {
  if (!Array.isArray(data)) throw new Error('メッセージの取得結果を確認できませんでした。再読み込みしてください。');
  const seen = new Set<string>();
  let threadId: string | null = null;
  for (const row of data) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('メッセージの整合性を確認できませんでした。再読み込みしてください。');
    }
    const value = row as Record<string, unknown>;
    if (typeof value.id !== 'string' || !UUID.test(value.id) ||
        typeof value.thread_id !== 'string' || !UUID.test(value.thread_id) ||
        (value.sender_role !== 'jobseeker' && value.sender_role !== 'facility') ||
        typeof value.body !== 'string' ||
        typeof value.created_at !== 'string' || !Number.isFinite(Date.parse(value.created_at)) ||
        seen.has(value.id) || (threadId !== null && threadId !== value.thread_id)) {
      throw new Error('メッセージの整合性を確認できませんでした。再読み込みしてください。');
    }
    seen.add(value.id);
    threadId = value.thread_id;
  }
  return data as CandidateMessageReadbackRow[];
}
