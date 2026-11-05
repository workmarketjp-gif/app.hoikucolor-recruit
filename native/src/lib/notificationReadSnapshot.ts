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
