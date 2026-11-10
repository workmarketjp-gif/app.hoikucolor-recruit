/**
 * A synchronous, presentation-only single-flight lease for application decisions.
 * React state does not commit between two taps in the same frame: a ref-backed
 * lease must be acquired before any async session pin or decision RPC starts.
 * Revocation on route blur prevents an old completion from changing a new view.
 * This is not authorization or server-side idempotency; canonical RPCs still
 * enforce candidate ownership and the final application state.
 */
export function createApplicationDecisionGate() {
  let generation = 0;
  let active: number | null = null;
  let invalidated = false;
  return {
    begin(): number | null {
      if (active !== null) return null;
      active = ++generation;
      invalidated = false;
      return active;
    },
    isCurrent(token: number): boolean {
      return Number.isSafeInteger(token) && active === token && !invalidated;
    },
    isBusy(): boolean {
      return active !== null;
    },
    /** Returns false for a superseded operation; do not clear another action's UI. */
    finish(token: number): boolean {
      if (!Number.isSafeInteger(token) || active !== token) return false;
      const accepted = !invalidated;
      active = null;
      invalidated = false;
      return accepted;
    },
    revoke(): void {
      generation++;
      // Keep the in-flight lock until it settles, even after blur. Reopening
      // the same route must not start a duplicate irreversible decision.
      if (active !== null) invalidated = true;
    },
  };
}
