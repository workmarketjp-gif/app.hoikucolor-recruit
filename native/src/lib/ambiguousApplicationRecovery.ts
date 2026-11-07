/**
 * Candidate-scoped recovery after a submit_application transport failure.
 * A fresh pin must belong to the SAME candidate and Clerk session as the
 * original action. A successful read under a different login is not evidence
 * that the original application succeeded or failed.
 *
 * This helper never submits an application and never changes the backend.
 */
export type RecoveryLease<Client> = Readonly<{
  ownerId: string;
  ownerSessionId: string;
  client: Client;
  isCurrent: () => boolean;
}>;

export type ApplicationRecoveryResult =
  | 'confirmed'
  | 'not_found'
  | 'read_failed'
  | 'quarantined';

export async function recoverAmbiguousApplication<Client>(options: {
  expectedOwnerId: string;
  expectedSessionId: string;
  jobId: string;
  canContinue: () => boolean;
  pin: () => Promise<RecoveryLease<Client> | null>;
  list: (client: Client) => Promise<ReadonlyArray<Readonly<{ id: string; job_id: string }>>>;
  onConfirmed: (applicationId: string) => void;
}): Promise<ApplicationRecoveryResult> {
  const active = () => options.canContinue();
  if (!active()) return 'quarantined';

  let pinned: RecoveryLease<Client> | null;
  try {
    pinned = await options.pin();
  } catch {
    return active() ? 'read_failed' : 'quarantined';
  }
  if (!pinned || !active() || !pinned.isCurrent() ||
      pinned.ownerId !== options.expectedOwnerId ||
      pinned.ownerSessionId !== options.expectedSessionId) return 'quarantined';

  let applications: ReadonlyArray<Readonly<{ id: string; job_id: string }>>;
  try {
    applications = await options.list(pinned.client);
  } catch {
    return active() && pinned.isCurrent() ? 'read_failed' : 'quarantined';
  }
  // A logout, lock, navigation, or account switch can occur WHILE the canonical
  // application list is being fetched. Never navigate on that stale answer.
  if (!active() || !pinned.isCurrent() ||
      pinned.ownerId !== options.expectedOwnerId ||
      pinned.ownerSessionId !== options.expectedSessionId) return 'quarantined';

  const committed = applications.find((application) => application.job_id === options.jobId);
  if (!committed) return 'not_found';
  options.onConfirmed(committed.id);
  return 'confirmed';
}
