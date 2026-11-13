/**
 * The scout RPCs use a true empty array / complete privacy object for an
 * authenticated candidate. A malformed envelope must never masquerade as
 * "no scouts" or silently clear the displayed blocking/opt-in settings.
 * Authorization and data isolation remain the server RPC's responsibility.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['pending', 'accepted', 'declined', 'cancelled', 'expired']);
const invalidInbox = () => new Error('スカウト一覧を確認できませんでした。再読み込みしてください。');
const invalidPrivacy = () => new Error('スカウト公開設定を確認できませんでした。再読み込みしてください。');

const objectRow = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const nullableText = (value: unknown) => value === null || typeof value === 'string';

export function verifiedScoutInbox<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw invalidInbox();
  const seen = new Set<string>();
  for (const value of data) {
    if (!objectRow(value) || !uuid(value.scout_id) ||
        !text(value.organization_name) || !text(value.facility_name) ||
        !nullableText(value.job_id) || (value.job_id !== null && !uuid(value.job_id)) ||
        !nullableText(value.job_title) || !nullableText(value.employment_type) ||
        typeof value.invitation_message !== 'string' ||
        typeof value.scout_status !== 'string' || !STATUSES.has(value.scout_status) ||
        !text(value.sent_at) || !text(value.expires_at) || !nullableText(value.responded_at)) {
      throw invalidInbox();
    }
    const key = (value.scout_id as string).toLowerCase();
    if (seen.has(key)) throw invalidInbox();
    seen.add(key);
  }
  return data as T[];
}

export function verifiedScoutPrivacy<T>(data: unknown): T {
  if (!objectRow(data) || typeof data.scout_opt_in !== 'boolean' ||
      typeof data.identity_fields_shared_before_consent !== 'boolean' ||
      !Array.isArray(data.manual_blocks) || !Array.isArray(data.automatic_blocks)) {
    throw invalidPrivacy();
  }
  // The candidate-facing screen promises no identity disclosure before
  // an explicit acceptance. If the canonical RPC says otherwise, block the
  // entire private settings view instead of displaying a false guarantee.
  // This is a response-consistency gate, not proof that server disclosure
  // is actually protected; backend authorization remains authoritative.
  if (data.identity_fields_shared_before_consent !== false) {
    throw new Error('承諾前の本人情報の非公開を確認できません。スカウト設定を表示できません。');
  }
  for (const [field, source] of [
    ['manual_blocks', 'manual'], ['automatic_blocks', 'current_employer'],
  ] as const) {
    const seen = new Set<string>();
    const blocks = data[field];
    if (!Array.isArray(blocks)) throw invalidPrivacy();
    for (const entry of blocks) {
      if (!objectRow(entry) || !uuid(entry.organization_id) ||
          !text(entry.organization_name) || entry.source !== source) throw invalidPrivacy();
      const key = entry.organization_id.toLowerCase();
      if (seen.has(key)) throw invalidPrivacy();
      seen.add(key);
    }
  }
  return data as T;
}

/**
 * Search results are a candidate-private, RPC-authorized organization row set.
 * A failed/malformed response must not be presented as "no organizations found";
 * in particular, never render a fabricated selectable organization ID.
 * The existing RPC is always called with p_limit=10.
 */
export function verifiedScoutBlockableOrganizations<T>(data: unknown): T[] {
  if (!Array.isArray(data) || data.length > 10) {
    throw new Error('法人の検索結果を確認できませんでした。もう一度検索してください。');
  }
  const seen = new Set<string>();
  for (const row of data) {
    if (!objectRow(row) || !uuid(row.organization_id) || !text(row.organization_name)) {
      throw new Error('法人の検索結果を確認できませんでした。もう一度検索してください。');
    }
    const key = row.organization_id.toLowerCase();
    if (seen.has(key)) {
      throw new Error('法人の検索結果を確認できませんでした。もう一度検索してください。');
    }
    seen.add(key);
  }
  return data as T[];
}
