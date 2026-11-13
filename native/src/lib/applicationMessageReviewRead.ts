import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

export type PendingApplicationMessageOwner = Readonly<{
  ownerId: string;
  ownerSessionId: string;
  applicationId: string;
}>;

/**
 * Reconcile an uncertain message send with a canonical, read-only thread fetch.
 * A hung Clerk token or message RPC must not lock the composer indefinitely.
 * This never retries a send or interprets a timed-out read as a missing message.
 * Verify the pending sender's owner/session/application BEFORE opening a thread.
 */
export async function readApplicationMessageReview<Client, Messages>(options: {
  pin: () => Promise<Readonly<{
    ownerId: string;
    ownerSessionId: string;
    client: Client;
    isCurrent: () => boolean;
  }> | null>;
  read: (client: Client, applicationId: string) => Promise<Messages>;
  applicationId: string;
  pendingOwner: PendingApplicationMessageOwner | null;
  isCurrent: () => boolean;
  timeoutMs?: number;
}): Promise<Messages> {
  const pinned = await pinCandidateForRead(options.pin, options.isCurrent, options.timeoutMs);
  if (options.pendingOwner && (
    options.pendingOwner.ownerId !== pinned.ownerId ||
    options.pendingOwner.ownerSessionId !== pinned.ownerSessionId ||
    options.pendingOwner.applicationId !== options.applicationId
  )) {
    throw new Error('前のログイン状態のメッセージは確認できません。');
  }
  const checkCurrent = () => {
    if (!options.isCurrent() || !pinned.isCurrent()) {
      throw new Error('安全なログイン状態を確認できませんでした。');
    }
  };
  checkCurrent();
  const messages = await boundedPrivateRead(() => {
    checkCurrent();
    return options.read(pinned.client, options.applicationId);
  }, options.timeoutMs);
  checkCurrent();
  return messages;
}
