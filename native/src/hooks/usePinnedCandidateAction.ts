import { useSession } from '@clerk/expo';
import { useCallback, useEffect, useRef } from 'react';
import { createNativeSupabase } from '../lib/supabase';
import { createPinnedCandidateMountLease } from '../lib/pinnedCandidateMountLease';
import { usePrivateDataQuarantine } from './usePrivateDataQuarantine';

/**
 * Pin Native work to the exact Clerk user + session that launched it.
 *
 * The shared Supabase client resolves Clerk tokens lazily. That is convenient
 * for ordinary reads, but an async operation that spans an A -> B session
 * replacement must never retarget to the next candidate. A pinned session uses
 * one launch-session token for its lifetime and exposes an ownership predicate
 * so late results can be discarded after session replacement/unmount.
 *
 * `pinCandidateSession()` is for account-scoped device metadata (for example
 * Push installation binding) that may continue while App Lock is visible.
 * `pinCandidateAction()` additionally requires the private-data boundary to be
 * open and is the default for candidate business reads/writes/navigation.
 * Effect epochs survive StrictMode setup/cleanup/setup without letting a
 * request from the earlier effect lifetime appear current again.
 */
export function usePinnedCandidateAction() {
  const { session } = useSession();
  const privacy = usePrivateDataQuarantine();
  const mountLeaseRef = useRef<ReturnType<typeof createPinnedCandidateMountLease> | null>(null);
  if (!mountLeaseRef.current) mountLeaseRef.current = createPinnedCandidateMountLease();
  const mountLease = mountLeaseRef.current;
  const identityRef = useRef({
    userId: session?.user?.id ?? null,
    sessionId: session?.id ?? null,
  });

  identityRef.current = {
    userId: session?.user?.id ?? null,
    sessionId: session?.id ?? null,
  };

  useEffect(() => {
    mountLease.activate();
    return () => { mountLease.revoke(); };
  }, [mountLease]);

  const isCurrentSession = useCallback((ownerId: string, ownerSessionId: string) => {
    const current = identityRef.current;
    return (
      mountLease.snapshot() !== null &&
      current.userId === ownerId &&
      current.sessionId === ownerSessionId
    );
  }, [mountLease]);

  const isCurrentOwner = useCallback((ownerId: string, ownerSessionId: string) => {
    return isCurrentSession(ownerId, ownerSessionId) && privacy.canAccessPrivateData();
  }, [isCurrentSession, privacy.canAccessPrivateData]);

  const pinCandidateSession = useCallback(async () => {
    const ownerId = session?.user?.id ?? null;
    const ownerSessionId = session?.id ?? null;
    const launchEpoch = mountLease.snapshot();
    if (!ownerId || !ownerSessionId || !session || launchEpoch === null) return null;

    const token = await session.getToken();
    if (!token || !mountLease.isCurrent(launchEpoch) || !isCurrentSession(ownerId, ownerSessionId)) return null;

    return {
      ownerId,
      ownerSessionId,
      client: createNativeSupabase(async () => token),
      isCurrent: () => mountLease.isCurrent(launchEpoch) && isCurrentSession(ownerId, ownerSessionId),
    };
  }, [isCurrentSession, mountLease, session]);

  const pinCandidateAction = useCallback(async () => {
    if (privacy.shieldVisible || !privacy.canAccessPrivateData()) return null;

    const pinned = await pinCandidateSession();
    if (!pinned || !pinned.isCurrent() || !isCurrentOwner(pinned.ownerId, pinned.ownerSessionId)) return null;

    return {
      ...pinned,
      isCurrent: () => pinned.isCurrent() && isCurrentOwner(pinned.ownerId, pinned.ownerSessionId),
    };
  }, [isCurrentOwner, pinCandidateSession, privacy.canAccessPrivateData, privacy.shieldVisible]);

  return { pinCandidateAction, pinCandidateSession, isCurrentOwner, isCurrentSession };
}
