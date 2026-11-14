/**
 * A push response may arrive through both the cold-start replay and the live
 * OS response listener before Clerk's asynchronous session pin resolves.
 * Claim the notification ID synchronously, before any await, so only one
 * canonical mark-read/navigation can be launched at a time. The caller must
 * release the lease in finally even after a timeout or uncertain write.
 * No user identifiers or notification payloads are stored here.
 */
export function tryBeginNotificationResponse(
  processingIds: Set<string>,
  notificationId: string,
): boolean {
  if (!notificationId || processingIds.has(notificationId)) return false;
  processingIds.add(notificationId);
  return true;
}
