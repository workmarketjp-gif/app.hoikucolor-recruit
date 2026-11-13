import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * The authoritative candidate-owned application index is the permission and
 * display gate for the message inbox. A failed/denied index must not start
 * an additional candidate-private attention RPC, and an expired view lease
 * must not publish either response.
 *
 * Once the index is confirmed, the attention summary loads independently:
 * its latency/error never hides an authorized thread list or invents zeros.
 * RPC authorization still belongs to the canonical backend.
 */
export type MessageInboxAttentionResult<T> =
  | Readonly<{ status: 'fulfilled'; value: T }>
  | Readonly<{ status: 'rejected' }>;

/**
 * Retry just the optional unread/scout attention RPC once the authoritative
 * application index has already been confirmed. A failed summary stays
 * unknown, and neither a revocation nor a pending token request can publish
 * a result for another account. No automatic retry or application re-read.
 */
export async function readIndependentMessageAttention<TAttention>(options: {
  loadAttention: () => Promise<TAttention>;
  isCurrent: () => boolean;
  timeoutMs?: number;
  onAttention: (result: MessageInboxAttentionResult<TAttention>) => void;
}): Promise<void> {
  if (!options.isCurrent()) return;
  let result: MessageInboxAttentionResult<TAttention>;
  try {
    const value = await boundedPrivateRead(() => {
      if (!options.isCurrent()) throw new Error('閲覧状態が変わったため読み込みを中止しました。');
      return options.loadAttention();
    }, options.timeoutMs);
    result = { status: 'fulfilled', value };
  } catch {
    result = { status: 'rejected' };
  }
  if (options.isCurrent()) options.onAttention(result);
}

export async function loadIndependentMessageInbox<TApplications, TAttention>(options: {
  loadApplications: () => Promise<TApplications>;
  loadAttention: () => Promise<TAttention>;
  isCurrent: () => boolean;
  /** Candidate-private read deadline; a timeout never triggers automatic retry. */
  timeoutMs?: number;
  onApplications: (value: TApplications) => void;
  onAttention: (result: MessageInboxAttentionResult<TAttention>) => void;
}): Promise<void> {
  // Check at *network launch* as well as publication. boundedPrivateRead
  // schedules the callback in a microtask; App Lock/account replacement can
  // revoke the lease after the loader is called but before that callback runs.
  const skippedBeforeLaunch = Symbol('inbox-read-revoked');

  // A rejection propagates to the screen's existing error branch. No attention
  // request should be made for an index that has not been authorized/verified.
  const applications = await boundedPrivateRead<TApplications | typeof skippedBeforeLaunch>(
    () => options.isCurrent() ? options.loadApplications() : Promise.resolve(skippedBeforeLaunch),
    options.timeoutMs,
  );
  if (!options.isCurrent() || applications === skippedBeforeLaunch) return;
  options.onApplications(applications);
  if (!options.isCurrent()) return;

  // Explicitly defer the optional RPC. This allows the application list to
  // render immediately; guard at start AND publication for App Lock / signout.
  // Consume request errors, distinguishing unavailable summary from zero.
  void Promise.resolve().then(() => readIndependentMessageAttention({
    loadAttention: options.loadAttention,
    isCurrent: options.isCurrent,
    timeoutMs: options.timeoutMs,
    onAttention: options.onAttention,
  }));
}
