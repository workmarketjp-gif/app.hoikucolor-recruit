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
