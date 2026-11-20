/**
 * Deduplicate the three canonical notification reads (list/count/attention)
 * within one candidate/session AND one private-data access epoch.
 * Quiet refreshes join an existing read only inside that exact epoch.
 * Explicit refreshes, including reads after a mark-read mutation, must run
 * AFTER an older in-flight snapshot so an older read cannot certify a write.
 *
 * Authorization still belongs to the caller's current-session pin and RLS.
 * isCurrent must include the candidate, session and privacy-epoch check; a
 * queued operation may never launch after logout, owner switch or App Lock.
 */
export function createNotificationCanonicalReadFlight() {
  type Active = { ownerKey: string; privacyEpoch: number; promise: Promise<void> };
  let active: Active | null = null;

  const read = (request: Readonly<{
    ownerKey: string | null;
    // Render-time privacy epoch changes on lock/unlock or owner handoff.
    // Optional only for compatibility with existing same-epoch callers.
    privacyEpoch?: number;
    intent: 'quiet' | 'fresh';
    isCurrent: () => boolean;
    execute: () => Promise<void>;
  }>): Promise<void> => {
    if (!request.ownerKey || !request.isCurrent()) {
      return Promise.reject(new Error('NOTIFICATION_READ_SESSION_CHANGED'));
    }
    const privacyEpoch = request.privacyEpoch ?? 0;
    // An older request for the same Clerk session must never absorb the
    // first canonical read after App Lock / unlock (or A -> B -> A).
    if (active?.ownerKey === request.ownerKey && active.privacyEpoch === privacyEpoch) {
      if (request.intent === 'quiet') return active.promise;
      // A post-write or user-requested refresh must observe a read started
      // after the older one settled; never silently reuse pre-write data.
      return active.promise.catch(() => undefined).then(() => read({
        ...request, intent: 'quiet',
      }));
    }

    const operation = Promise.resolve().then(() => {
      if (!request.isCurrent()) throw new Error('NOTIFICATION_READ_SESSION_CHANGED');
      return request.execute();
    });
    const slot: Active = { ownerKey: request.ownerKey, privacyEpoch, promise: operation };
    active = slot;
    // A rejected read should still clear its flight; avoid a detached,
    // unhandled rejection from the cleanup observer.
    void operation.then(
      () => { if (active === slot) active = null; },
      () => { if (active === slot) active = null; },
    );
    return operation;
  };
  return { read };
}
