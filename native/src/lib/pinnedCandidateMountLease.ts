/**
 * An effect-lifetime lease for private candidate actions.
 *
 * React StrictMode may run setup -> cleanup -> setup without replacing the
 * component. A boolean that is only cleared in cleanup can permanently
 * disable every private API call; simply re-setting the boolean also risks
 * allowing an in-flight call from the revoked first setup to commit.
 * Capturing an epoch when an operation starts fixes both cases.
 */
export function createPinnedCandidateMountLease() {
  let epoch = 0;
  let active = false;
  return {
    activate() {
      epoch += 1;
      active = true;
    },
    revoke() {
      epoch += 1;
      active = false;
    },
    snapshot(): number | null {
      return active ? epoch : null;
    },
    isCurrent(snapshot: number | null): boolean {
      return snapshot !== null && active && snapshot === epoch;
    },
  };
}
