import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

/**
 * Candidate visit reservations and the current job's available visit settings
 * are both private canonical reads. Bound each read independently and require
 * one pinned, unchanged Clerk owner/session before launch and publication.
 * A timeout is a presentation deadline, not an RPC cancellation or a retry.
 * This helper must never wrap request/cancel mutations.
 */
export async function readCandidateVisitSnapshot<TClient, TVisits, TSettings>(options: {
  pin: () => Promise<{
    client: TClient;
    ownerId: string;
    ownerSessionId: string;
    isCurrent: () => boolean;
  } | null>;
  expectedOwnerKey: string | null;
  resolveOwnerKey: (ownerId: string, sessionId: string) => string | null;
  isScreenCurrent: () => boolean;
  listVisits: (client: TClient) => Promise<TVisits>;
  readSettings: (client: TClient) => Promise<TSettings>;
  timeoutMs?: number;
}): Promise<{ ownerKey: string; visits: TVisits; settings: TSettings }> {
  const pinned = await pinCandidateForRead(options.pin, options.isScreenCurrent, options.timeoutMs);
  const ownerKey = options.resolveOwnerKey(pinned.ownerId, pinned.ownerSessionId);
  const current = () => Boolean(ownerKey) && ownerKey === options.expectedOwnerKey &&
    options.isScreenCurrent() && pinned.isCurrent();
  if (!current()) throw new Error('安全なログイン状態を確認できませんでした。');
  const read = <T>(work: () => Promise<T>): Promise<T> => boundedPrivateRead(() => {
    if (!current()) throw new Error('閲覧状態が変わったため読み込みを中止しました。');
    return work();
  }, options.timeoutMs);
  const [visits, settings] = await Promise.all([
    read(() => options.listVisits(pinned.client)),
    read(() => options.readSettings(pinned.client)),
  ]);
  if (!current() || !ownerKey) throw new Error('閲覧状態が変わりました。');
  return { ownerKey, visits, settings };
}
