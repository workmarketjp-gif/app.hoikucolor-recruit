/**
 * hc_jobseeker_mark_notification_read(uuid) RETURNS boolean: true means an
 * authenticated candidate-owned notification was updated (including already
 * read rows); false means no owned row matched. An absent/malformed scalar
 * is not proof of a successful write. The caller must not claim that it was
 * acknowledged or navigate as though it was marked read.
 */
export function requireConfirmedNotificationRead(raw: unknown): void {
  if (raw === true) return;
  if (raw === false) throw new Error('NOTIFICATION_NOT_FOUND');
  throw new Error('NOTIFICATION_MARK_READ_UNCONFIRMED');
}
