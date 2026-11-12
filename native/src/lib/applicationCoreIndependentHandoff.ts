import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * A candidate-owned application detail is the mandatory authorization parent.
 * Its interview/visit/offer content can render without waiting for either
 * messages or document handoff. Child reads must not even *start* before the
 * parent's canonical read confirms access and the session/screen is current.
 *
 * The underlying RPCs enforce authorization; this client gate additionally
 * avoids unnecessary private reads for a missing, denied or revoked parent.
 * A failed child read is never fabricated as an empty thread or as delivered
 * documents. No read here sends messages or changes application state.
 */
export type ApplicationChildRead<T> =
  | Readonly<{ status: 'fulfilled'; value: T }>
  | Readonly<{ status: 'rejected' }>;

export async function loadApplicationCoreIndependentHandoff<TDetail, TMessages, THandoff>(options: {
  loadDetail: () => Promise<TDetail | null>;
  loadMessages: () => Promise<TMessages>;
  loadHandoff: () => Promise<THandoff | null>;
  isCurrent: () => boolean;
  /** Same read deadline for the parent and each child; no automatic retry. */
  timeoutMs?: number;
  onDetail: (detail: TDetail) => void;
  onMessages: (result: ApplicationChildRead<TMessages>) => void;
  onHandoff: (handoff: THandoff | null) => void;
}): Promise<void> {
  // Both parent and child private reads are deferred by boundedPrivateRead.
  // The screen lease can be revoked between scheduling and the actual RPC.
  // No new candidate-private request may launch after that revocation.
  const requireCurrent = () => {
    if (!options.isCurrent()) throw new Error('閲覧状態が変わったため読み込みを中止しました。');
  };

  const skippedBeforeLaunch = Symbol('application-read-revoked');

  // Parent rejection propagates. No child RPC is started on authorization
  // failure, missing application, expired session or abandoned screen.
  const detail = await boundedPrivateRead<TDetail | null | typeof skippedBeforeLaunch>(
    () => options.isCurrent() ? options.loadDetail() : Promise.resolve(skippedBeforeLaunch),
    options.timeoutMs,
  );
  if (!options.isCurrent() || detail === null || detail === skippedBeforeLaunch) return;
  options.onDetail(detail);
  if (!options.isCurrent()) return;

  // Independent reads begin *after* the parent is confirmed. Both recheck
  // freshness at the scheduled start and at publication. Caught rejections
  // cannot become unhandled if a route is abandoned while the RPC is pending.
  void Promise.resolve().then(async () => {
    if (!options.isCurrent()) return;
    let result: ApplicationChildRead<TMessages>;
    try {
      result = { status: 'fulfilled', value: await boundedPrivateRead(() => { requireCurrent(); return options.loadMessages(); }, options.timeoutMs) };
    } catch {
      result = { status: 'rejected' };
    }
    if (options.isCurrent()) options.onMessages(result);
  });

  void Promise.resolve().then(async () => {
    if (!options.isCurrent()) return;
    let handoff: THandoff | null;
    try {
      handoff = await boundedPrivateRead(() => { requireCurrent(); return options.loadHandoff(); }, options.timeoutMs);
    } catch {
      handoff = null;
    }
    if (options.isCurrent()) options.onHandoff(handoff);
  });
}

/**
 * Retry the optional document-handoff read without discarding already
 * authorized application details, interview timeline, or verified messages.
 * A revoked screen/session must not start or publish a candidate-private RPC.
 * Null and transport failure both remain unverified, never "delivered".
 */
export async function retryApplicationDocumentStatus<T>(options: {
  read: () => Promise<T | null>;
  isCurrent: () => boolean;
  onResult: (result: ApplicationChildRead<T | null>) => void;
  timeoutMs?: number;
}): Promise<void> {
  const revoked = Symbol('application-document-status-revoked');
  try {
    const value = await boundedPrivateRead<T | null | typeof revoked>(
      () => options.isCurrent() ? options.read() : Promise.resolve(revoked),
      options.timeoutMs,
    );
    if (value !== revoked && options.isCurrent()) {
      options.onResult({ status: 'fulfilled', value });
    }
  } catch {
    if (options.isCurrent()) options.onResult({ status: 'rejected' });
  }
}
