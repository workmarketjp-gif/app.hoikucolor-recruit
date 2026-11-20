/**
 * Screen-local presentation fence for candidate visit request/cancellation.
 * Prevents two same-frame presses launching two durable writes; does not
 * replace canonical RPC authorization, receipt idempotency or readback.
 */
export function createVisitMutationTapGate() {
  let epoch = 0;
  let pending = false;
  return {
    begin(): number | null {
      if (pending) return null;
      pending = true;
      return epoch;
    },
    isCurrent(ticket: number): boolean {
      return pending && ticket === epoch;
    },
    /** Hold a verified request until navigation blur; otherwise allow retry. */
    settle(ticket: number, holdUntilBlur = false): boolean {
      if (!pending || ticket !== epoch) return false;
      if (!holdUntilBlur) pending = false;
      return true;
    },
    /** Revocation also prevents a late finally from unlocking a newer press. */
    invalidate(): void {
      epoch += 1;
      pending = false;
    },
    isPending(): boolean {
      return pending;
    },
  };
}
