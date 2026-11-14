/** An owner/session-scoped synchronous entry gate for a potentially committed
 * mark-all RPC. Never start a duplicate write while the first is unresolved. */
export function createNotificationMarkAllSingleFlight() {
  const pending = new Set<string>();
  return {
    tryStart(ownerKey: string): boolean {
      if (!ownerKey || pending.has(ownerKey)) return false;
      pending.add(ownerKey);
      return true;
    },
    complete(ownerKey: string): void {
      pending.delete(ownerKey);
    },
    isPending(ownerKey: string): boolean {
      return pending.has(ownerKey);
    },
  };
}
