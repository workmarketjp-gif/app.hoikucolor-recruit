import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * Load the canonical candidate application index with a per-operation deadline.
 * A late Clerk token or Supabase response must not revive a revoked App Lock,
 * focus generation or candidate session. Both calls are reads: do not retry
 * automatically, treat an error as an empty list or change server privileges.
 */
export type ApplicationIndexPin<TClient> = Readonly<{
  client: TClient;
  ownerId: string;
  ownerSessionId: string;
  isCurrent: () => boolean;
}>;

export async function readCandidateApplicationIndex<TClient, TRows>(options: {
  pin: () => Promise<ApplicationIndexPin<TClient> | null>;
  list: (client: TClient) => Promise<TRows>;
  expectedOwnerKey: string | null;
  resolveOwnerKey: (ownerId: string, sessionId: string) => string | null;
  isActive: () => boolean;
  timeoutMs?: number;
}): Promise<{ ownerKey: string; rows: TRows }> {
  const pin = await boundedPrivateRead(() => {
    if (!options.isActive()) throw new Error('閲覧状態が変わりました。');
    return options.pin();
  }, options.timeoutMs);
  const resolvedOwner = pin ? options.resolveOwnerKey(pin.ownerId, pin.ownerSessionId) : null;
  const authorized = () => Boolean(pin?.isCurrent()) && options.isActive() &&
    Boolean(resolvedOwner) && resolvedOwner === options.expectedOwnerKey;
  if (!authorized()) throw new Error('安全なログイン状態を確認できませんでした。');

  const rows = await boundedPrivateRead(() => {
    if (!authorized()) throw new Error('閲覧状態が変わりました。');
    return options.list(pin!.client);
  }, options.timeoutMs);
  if (!authorized() || !resolvedOwner) throw new Error('閲覧状態が変わりました。');
  return { ownerKey: resolvedOwner, rows };
}
