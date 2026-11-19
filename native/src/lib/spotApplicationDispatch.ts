/**
 * The same durable pending-application registry is shared with the home flow.
 * A Spot submit is NOT idempotent: once an arm was persisted, a retry must not
 * dispatch another RPC until a separate canonical recovery confirms its fate.
 *
 * `armPending` must be the existing per-candidate/job serialized
 * `armPendingHomeApplication`; true means an unresolved marker already exists.
 * A stale session after arming retains the marker (never auto-releases it).
 */
export async function armSpotApplicationDispatch(options: {
  isCurrent: () => boolean;
  armPending: () => Promise<boolean>;
}): Promise<'armed' | 'unresolved' | 'stale'> {
  if (!options.isCurrent()) return 'stale';
  const reused = await options.armPending();
  if (!options.isCurrent()) return 'stale';
  return reused ? 'unresolved' : 'armed';
}
