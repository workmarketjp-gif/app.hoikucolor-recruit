/**
 * Serializes vault operations synchronously, before React can commit disabled
 * controls. In-flight async completions must not release a newer operation
 * after an account/session or foreground privacy boundary changes.
 * No server authorization is inferred from this local UI lease.
 */
export function createVaultOperationLease() {
  let current: number | null = null;
  let epoch = 0;
  return {
    tryAcquire(): number | null {
      if (current !== null) return null;
      current = ++epoch;
      return current;
    },
    /** Is this exact operation still permitted after a privacy/session boundary? */
    isCurrent(token: number): boolean {
      return current === token;
    },
    release(token: number): boolean {
      if (token !== current) return false;
      current = null;
      return true;
    },
    reset(): void {
      current = null;
      epoch += 1;
    },
    isBusy(): boolean {
      return current !== null;
    },
  };
}
