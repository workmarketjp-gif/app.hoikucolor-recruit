import { candidateViewOwnerKey } from './candidateViewOwner.ts';

/**
 * A destructive account-deletion confirmation is valid only for the exact
 * Clerk user AND session that opened the dialog. App Lock, a pending account
 * status read, or another deletion transition invalidates the confirmation.
 * This is a client-side safety fence, not a substitute for server-side RLS.
 */
export type CandidateDeletionConfirmationState = Readonly<{
  ownerKey: string | null;
  privateAllowed: boolean;
  deletionBusy: boolean;
  deletionCanRequest: boolean;
}>;

export function canConfirmCandidateDeletion(
  requestedOwnerKey: string | null,
  current: CandidateDeletionConfirmationState,
): boolean {
  return requestedOwnerKey !== null &&
    requestedOwnerKey === current.ownerKey &&
    current.privateAllowed && !current.deletionBusy && current.deletionCanRequest;
}

/**
 * Even after the alert callback passes, Clerk may switch sessions while the
 * token is being acquired. Never invoke the deletion RPC for a retargeted pin.
 */
export function canBeginCandidateDeletion(
  requestedOwnerKey: string | null,
  pinned: {
    ownerId: string;
    ownerSessionId: string;
    isCurrent: () => boolean;
  } | null,
): boolean {
  return requestedOwnerKey !== null && !!pinned &&
    pinned.isCurrent() &&
    candidateViewOwnerKey(pinned.ownerId, pinned.ownerSessionId) === requestedOwnerKey;
}
