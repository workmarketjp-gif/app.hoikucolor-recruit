/**
 * Fail closed when the authenticated saved-jobs RPC returns malformed data.
 * A true empty array means the candidate has no saved jobs; broken or
 * duplicate rows must not be displayed as open/closed employment offers.
 * This does not replace server-side candidate isolation or RLS.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bad = () => new Error('気になる求人を確認できませんでした。更新してください。');

export function verifiedSavedJobRows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw bad();
  const ids = new Set<string>();
  for (const value of data) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
    const row = value as Record<string, unknown>;
    if (typeof row.id !== 'string' || !UUID.test(row.id) ||
        typeof row.facility_id !== 'string' || !UUID.test(row.facility_id) ||
        typeof row.title !== 'string' || !row.title.trim() ||
        typeof row.facility_name !== 'string' || !row.facility_name.trim() ||
        typeof row.is_open !== 'boolean') throw bad();
    const key = row.id.toLowerCase();
    if (ids.has(key)) throw bad();
    ids.add(key);
  }
  return data as T[];
}
