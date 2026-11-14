/** Keep the authenticated Native notification timestamp copy aligned with the
 * existing Web NotificationCenter.relativeTime implementation. Invalid dates
 * have no visible relative label; future dates show the same "just now" copy
 * as the existing Web, rather than an invented future delivery estimate. */
export function notificationRelativeTime(value: string, nowMs = Date.now()): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const diff = nowMs - timestamp;
  if (diff < 60_000) return 'たった今';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(timestamp));
}
