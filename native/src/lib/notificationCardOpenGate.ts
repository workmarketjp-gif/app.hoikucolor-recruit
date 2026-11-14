/**
 * A tap must not start a second mark-read RPC for the same notification while
 * the first open is unsettled. Keep the key scoped to the candidate session,
 * not a global notification ID: another account must not inherit its lock.
 * The caller releases only in finally, including an ambiguous write outcome.
 */
export function createNotificationCardOpenGate() {
  const pendingByOwner = new Map<string, Set<string>>();
  return {
    tryStart(ownerKey: string, notificationId: string): boolean {
      if (!ownerKey || !notificationId) return false;
      const pending = pendingByOwner.get(ownerKey) ?? new Set<string>();
      if (pending.has(notificationId)) return false;
      pending.add(notificationId);
      pendingByOwner.set(ownerKey, pending);
      return true;
    },
    complete(ownerKey: string, notificationId: string): void {
      const pending = pendingByOwner.get(ownerKey);
      if (!pending) return;
      pending.delete(notificationId);
      if (pending.size === 0) pendingByOwner.delete(ownerKey);
    },
    isPending(ownerKey: string, notificationId: string): boolean {
      return pendingByOwner.get(ownerKey)?.has(notificationId) ?? false;
    },
  };
}
