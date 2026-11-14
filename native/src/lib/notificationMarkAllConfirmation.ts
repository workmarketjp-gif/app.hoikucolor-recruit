/**
 * hc_jobseeker_mark_all_notifications_read() RETURNS integer: the number of
 * candidate-owned unread notifications updated. A legitimate zero means no
 * unread row remained at write time; it does not prove an older list was fresh.
 * An absent or malformed RPC result must not be treated as a confirmed write.
 */
export function requireConfirmedNotificationMarkAllCount(raw: unknown): number {
  const count = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^(0|[1-9][0-9]*)$/.test(raw)
      ? Number(raw)
      : NaN;
  if (!Number.isSafeInteger(count) || count < 0 || count > 2_147_483_647) {
    throw new Error('NOTIFICATION_MARK_ALL_UNCONFIRMED');
  }
  return count;
}
