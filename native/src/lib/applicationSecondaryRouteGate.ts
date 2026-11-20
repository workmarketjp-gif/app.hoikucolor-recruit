/**
 * Routes from the candidate application index that do not rely on a selected
 * application row (currently 見学・体験). They still require a live exact Clerk
 * candidate/session pin before pushing a protected destination.
 *
 * Claim navigation synchronously before the first await: an application-row
 * tap or another secondary tap must not enqueue a second stack push. Successful
 * navigation retains this gate until blur; an error permits a user retry.
 * This is a client presentation gate, never a replacement for route/RLS auth.
 */
export type ApplicationSecondaryRoutePin = Readonly<{
  ownerId: string;
  ownerSessionId: string;
  isCurrent: () => boolean;
}>;

export type ApplicationSecondaryRouteResult = 'opened' | 'blocked' | 'failed';

export function createApplicationSecondaryRouteGate() {
  let generation = 0;
  let pending = false;

  return {
    isPending: () => pending,
    invalidate: () => { generation += 1; pending = false; },
    async navigate<TPin extends ApplicationSecondaryRoutePin>(options: {
      expectedOwnerKey: string | null;
      currentOwnerKey: () => string | null;
      canNavigate: () => boolean;
      resolveOwnerKey: (userId: string, sessionId: string) => string | null;
      pin: (isCurrent: () => boolean) => Promise<TPin | null>;
      navigate: () => void;
    }): Promise<ApplicationSecondaryRouteResult> {
      if (pending || !options.expectedOwnerKey ||
          options.currentOwnerKey() !== options.expectedOwnerKey ||
          !options.canNavigate()) return 'blocked';
      pending = true;
      const ticket = ++generation;
      const isCurrent = () => pending && ticket === generation &&
        options.currentOwnerKey() === options.expectedOwnerKey &&
        options.canNavigate();
      let opened = false;
      try {
        // The passed pin operation must be bounded and must re-check
        // isCurrent at token-request launch, not just on completion.
        const pinned = await options.pin(isCurrent);
        if (!isCurrent()) return 'blocked';
        if (!pinned || !pinned.isCurrent() ||
            options.resolveOwnerKey(pinned.ownerId, pinned.ownerSessionId) !== options.expectedOwnerKey) {
          return 'failed';
        }
        // Only this exact, still-authorized request may trigger navigation.
        options.navigate();
        opened = true;
        return 'opened';
      } catch {
        return isCurrent() ? 'failed' : 'blocked';
      } finally {
        // Keep the single-flight gate until the destination blurs us.
        // Do not let a late failed request release a newer owner's gate.
        if (!opened && ticket === generation) pending = false;
      }
    },
  };
}
