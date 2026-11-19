/**
 * Single-flight lease for candidate-owned Spot snapshots. An explicit retry,
 * focus event or foreground refresh must not launch duplicate Clerk/RPC reads
 * while another read for the same owner remains active.
 *
 * Losing focus or changing candidate invalidates the old lease. Late completion
 * of that lease cannot clear the newer owner's active read; the screen also
 * enforces its own generation, privacy and session checks before publishing.
 */
export type SpotReadLease = Readonly<{ ownerKey: string; token: number }>;

export function createSpotReadSingleFlight() {
  let nextToken = 0;
  let active: SpotReadLease | null = null;

  return {
    begin(ownerKey: string | null): SpotReadLease | null {
      if (!ownerKey) return null;
      if (active?.ownerKey === ownerKey) return null;
      const lease: SpotReadLease = { ownerKey, token: ++nextToken };
      active = lease;
      return lease;
    },
    isCurrent(lease: SpotReadLease): boolean {
      return active === lease;
    },
    isBusy(ownerKey: string | null): boolean {
      return Boolean(ownerKey && active?.ownerKey === ownerKey);
    },
    finish(lease: SpotReadLease): void {
      if (active === lease) active = null;
    },
    invalidate(): void {
      active = null;
    },
  };
}
