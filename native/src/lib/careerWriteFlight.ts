/**
 * Synchronously leases a career-conditions mutation before React can flush a
 * disabled/busy render. Without this, two taps in the same event frame can
 * start overlapping private save/delete RPCs.
 *
 * The lease is scoped to the exact candidate+Clerk session key, not the
 * screen's current boolean busy state. A late completion for candidate A
 * must not release candidate B's flight after account switching.
 */
export type CareerWriteLease = Readonly<{ ownerKey: string; generation: number }>;
export type CareerWriteLeaseRef = { current: CareerWriteLease | null };

export function beginCareerWrite(
  ref: CareerWriteLeaseRef,
  ownerKey: string,
  generation: number,
): CareerWriteLease | null {
  if (!ownerKey || ref.current?.ownerKey === ownerKey) return null;
  const lease: CareerWriteLease = { ownerKey, generation };
  ref.current = lease;
  return lease;
}

export function finishCareerWrite(ref: CareerWriteLeaseRef, lease: CareerWriteLease): void {
  if (ref.current === lease) ref.current = null;
}
