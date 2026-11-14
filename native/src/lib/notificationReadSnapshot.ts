/**
 * Canonical notification reads can independently fail. Only a successful list
 * read establishes a displayable list; failed counts/attention remain unknown
 * (never zero). This is presentation state, not an authorization decision.
 */
export type CanonicalNotificationRead<TNotification, TAttention> = Readonly<{
  notifications: TNotification[];
  unreadCount: number | null;
  attentionSummary: TAttention | null;
  warning: string | null;
}>;

export function resolveCanonicalNotificationRead<TNotification, TAttention>(
  rows: PromiseSettledResult<TNotification[]>,
  count: PromiseSettledResult<number>,
  attention: PromiseSettledResult<TAttention>,
): CanonicalNotificationRead<TNotification, TAttention> {
  if (rows.status === 'rejected') throw rows.reason;
  return {
    notifications: rows.value,
    unreadCount: count.status === 'fulfilled' ? count.value : null,
    attentionSummary: attention.status === 'fulfilled' ? attention.value : null,
    warning: count.status === 'rejected' || attention.status === 'rejected'
      ? '通知の一部を取得できませんでした。更新して再確認してください。'
      : null,
  };
}

/**
 * Do not coerce an absent/null RPC scalar to zero. PostgreSQL counts may arrive
 * as JSON numbers or exact base-10 strings; no other JS coercions are safe.
 * An invalid count must reject so the caller's allSettled read keeps it unknown.
 */
export function parseCanonicalUnreadNotificationCount(raw: unknown): number {
  let count: number;
  if (typeof raw === 'number') {
    count = raw;
  } else if (typeof raw === 'string' && /^(0|[1-9][0-9]*)$/.test(raw)) {
    count = Number(raw);
  } else {
    throw new Error('NOTIFICATION_UNREAD_COUNT_UNAVAILABLE');
  }
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('NOTIFICATION_UNREAD_COUNT_UNAVAILABLE');
  }
  return count;
}

/**
 * A PostgreSQL RETURNS TABLE notification RPC resolves to an array, including
 * [] when it genuinely has no rows. A successful HTTP response with null,
 * a scalar or malformed rows is not proof of an empty inbox.
 *
 * Keep this boundary strict so unknown read_at values cannot silently become
 * "unread" and a broken response cannot trigger a false all-read/empty state.
 * Do not filter invalid rows (that would hide genuine notifications).
 */
export type CanonicalNotificationRow = Readonly<{
  id: string;
  application_id: string | null;
  notification_type: string;
  title: string;
  body: string;
  link_url: string | null;
  read_at: string | null;
  created_at: string;
}>;

export function parseCanonicalNotificationRows<T extends CanonicalNotificationRow>(raw: unknown): T[] {
  if (!Array.isArray(raw)) throw new Error('NOTIFICATION_LIST_UNAVAILABLE');
  const seenIds = new Set<string>();
  for (const value of raw) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.id !== 'string' || value.id.length === 0 || seenIds.has(value.id) ||
        (value.application_id !== null && typeof value.application_id !== 'string') ||
        typeof value.notification_type !== 'string' || !value.notification_type ||
        typeof value.title !== 'string' || typeof value.body !== 'string' ||
        (value.link_url !== null && typeof value.link_url !== 'string') ||
        (value.read_at !== null && typeof value.read_at !== 'string') ||
        typeof value.created_at !== 'string' || !value.created_at) {
      throw new Error('NOTIFICATION_LIST_UNAVAILABLE');
    }
    seenIds.add(value.id);
  }
  return raw as T[];
}
