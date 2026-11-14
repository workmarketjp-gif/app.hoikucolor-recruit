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
