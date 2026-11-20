import { boundedPrivateRead, DEFAULT_PRIVATE_READ_TIMEOUT_MS } from './privateReadDeadline.ts';

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
  /** Total read-only recovery budget, including the Clerk pin and canonical list. */
  timeoutMs?: number;
}): Promise<ApplicationRecoveryResult> {
  const active = () => options.canContinue();
  if (!active()) return 'quarantined';
  // A post-submit transport error is ambiguous: make one bounded, read-only
  // reconciliation attempt. Timeout never proves the application is absent
  // and never authorizes a second submit or delayed navigation.
  const budget = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? Math.max(1, Math.floor(options.timeoutMs)) : DEFAULT_PRIVATE_READ_TIMEOUT_MS;
  const deadline = Date.now() + budget;
  const remaining = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new Error('応募状況の確認がタイムアウトしました。');
    return ms;
  };

  let pinned: RecoveryLease<Client> | null;
  try {
    pinned = await boundedPrivateRead(() => {
      if (!active()) throw new Error('安全なログイン状態を確認できませんでした。');
      return options.pin();
    }, remaining());
  } catch {
    return active() ? 'read_failed' : 'quarantined';
  }
  if (!pinned || !active() || !pinned.isCurrent() ||
      pinned.ownerId !== options.expectedOwnerId ||
      pinned.ownerSessionId !== options.expectedSessionId) return 'quarantined';

  let applications: ReadonlyArray<Readonly<{ id: string; job_id: string }>>;
  try {
    applications = await boundedPrivateRead(() => {
      if (!active() || !pinned?.isCurrent()) {
        throw new Error('安全なログイン状態を確認できませんでした。');
      }
      return options.list(pinned.client);
    }, remaining());
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
