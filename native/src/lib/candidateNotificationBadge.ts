/** A null/unverified notification count must not become a false zero. */
export function candidateNotificationBadge(count: number | null | undefined): string | null {
  if (count == null || !Number.isSafeInteger(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}
