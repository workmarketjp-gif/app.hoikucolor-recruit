import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

type PinnedVaultCandidate<TClient> = Readonly<{
  client: TClient;
  ownerId: string;
  ownerSessionId: string;
  isCurrent: () => boolean;
}>;

/**
 * Load candidate-private saved documents under one bounded Clerk pin and one
 * bounded canonical read. Both phases are display-only deadlines, not network
 * cancellation. A result is publishable only for the exact current session,
 * generation and privately authorized owner, after per-row ownership checks.
 * An error or ambiguous read must never be represented as an empty vault.
 */
export async function readCandidateVaultSnapshot<TClient, TDocument>(options: {
  pin: () => Promise<PinnedVaultCandidate<TClient> | null>;
  read: (client: TClient) => Promise<TDocument[]>;
  ownerKey: string;
  ownerKeyFor: (ownerId: string, ownerSessionId: string) => string | null;
  isCurrent: () => boolean;
  assertDocumentOwner: (rows: TDocument[], ownerId: string) => void;
  timeoutMs?: number;
}): Promise<TDocument[]> {
  if (!options.ownerKey || !options.isCurrent()) {
    throw new Error('安全なログイン状態を確認できませんでした。');
  }

  const pinned = await pinCandidateForRead(options.pin, options.isCurrent, options.timeoutMs);
  const requireCurrent = () => {
    if (!options.isCurrent() || !pinned.isCurrent() ||
        options.ownerKeyFor(pinned.ownerId, pinned.ownerSessionId) !== options.ownerKey) {
      throw new Error('応募書類の閲覧状態を確認できませんでした。再読み込みしてください。');
    }
  };
  requireCurrent();

  const rows = await boundedPrivateRead(() => {
    requireCurrent();
    return options.read(pinned.client);
  }, options.timeoutMs);
  requireCurrent();
  // Server RLS is authoritative. This additional check prevents a malformed or
  // cross-owner canonical response from unlocking the Native document controls.
  options.assertDocumentOwner(rows, pinned.ownerId);
  requireCurrent();
  return rows;
}
