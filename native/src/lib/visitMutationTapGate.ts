/**
 * Screen-local presentation fence for candidate visit request/cancellation.
 * Prevents two same-frame presses launching two durable writes; does not
 * replace canonical RPC authorization, receipt idempotency or readback.
 */
export function createVisitMutationTapGate() {
  let epoch = 0;
  let pending = false;
  let quarantined = false;
  return {
    begin(): number | null {
      if (pending) return null;
      pending = true;
      quarantined = false;
      return epoch;
    },
    isCurrent(ticket: number): boolean {
      return pending && ticket === epoch;
    },
    /** Hold a verified request until navigation blur; otherwise allow retry. */
    settle(ticket: number, holdUntilBlur = false): boolean {
      if (!pending || ticket !== epoch) return false;
      if (!holdUntilBlur) {
        pending = false;
        // Never reuse an epoch after settlement: a stale timer or finally
        // from a completed attempt must not quarantine the next operation.
        epoch += 1;
      }
      return true;
    },
    /**
     * A network deadline does not mean the server aborted the booking/cancel.
     * Revoke the caller's epoch but retain the lane until focus cleanup;
     * an old async continuation cannot read, navigate or clear its receipt.
     */
    quarantine(ticket: number): boolean {
      if (!pending || ticket !== epoch || quarantined) return false;
      epoch += 1;
      quarantined = true;
      return true;
    },
    isQuarantined(): boolean {
      return quarantined;
    },
    /** Revocation also prevents a late finally from unlocking a newer press. */
    invalidate(): void {
      epoch += 1;
      pending = false;
      quarantined = false;
    },
    isPending(): boolean {
      return pending;
    },
  };
}
