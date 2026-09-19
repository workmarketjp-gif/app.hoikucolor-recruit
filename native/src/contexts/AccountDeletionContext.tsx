import { useClerk } from '@clerk/expo';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccountDeletionGate } from '../components/AccountDeletionGate';
import { usePinnedCandidateAction } from '../hooks/usePinnedCandidateAction';
import {
  cancelAccountDeletion,
  getAccountDeletionRequest,
  requestAccountDeletion,
  type AccountDeletionRequest,
} from '../lib/accountDeletionApi';
import { getAccountDeletionUiPolicy } from '../lib/accountDeletionPolicy';
import { purgeCandidatePrivateLocalState } from '../lib/candidateLocalPrivacyPurge';
import {
  blockCandidateLocalStateSession,
  unblockCandidateLocalStateSession,
} from '../lib/candidateLocalStateSession';
import {
  blockDurableMutationSession,
  unblockDurableMutationSession,
} from '../lib/durableMutation';
import {
  quarantineLocalPushIdentity,
  quiescePushBindingOperations,
  revokePush,
  unblockPushBindingOperations,
} from '../lib/notifications';

type AccountDeletionContextValue = {
  request: AccountDeletionRequest | null;
  loading: boolean;
  busy: boolean;
  lastError: string | null;
  localPurgeError: string | null;
  refresh: () => Promise<AccountDeletionRequest | null>;
  requestDeletion: () => Promise<AccountDeletionRequest>;
  cancelDeletion: () => Promise<AccountDeletionRequest>;
  signOutSafely: () => Promise<void>;
};

const AccountDeletionContext = createContext<AccountDeletionContextValue | null>(null);

function errorMessage(error: unknown) {
  return String((error as { message?: unknown } | null)?.message ?? error ?? 'UNKNOWN_ERROR');
}

export function AccountDeletionProvider({ children }: PropsWithChildren) {
  const { signOut } = useClerk();
  const { pinCandidateAction, pinCandidateSession } = usePinnedCandidateAction();
  const [request, setRequest] = useState<AccountDeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [localPurgeError, setLocalPurgeError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);
  const quarantineGeneration = useRef<number | null>(null);

  const ensureLocalQuarantine = useCallback(async (ownerId: string) => {
    if (quarantineGeneration.current == null) {
      quarantineGeneration.current = await quiescePushBindingOperations();
    }

    const generation = quarantineGeneration.current;
    const results = await Promise.allSettled([
      purgeCandidatePrivateLocalState(ownerId),
      quarantineLocalPushIdentity(generation, { requirePresentationCleanup: true }),
    ]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed && failed.status === 'rejected') {
      const message = errorMessage(failed.reason);
      setLocalPurgeError(message);
      throw new Error(message);
    }
    setLocalPurgeError(null);
  }, []);

  const releaseLocalQuarantine = useCallback(() => {
    const generation = quarantineGeneration.current;
    if (generation != null) {
      unblockPushBindingOperations(generation);
      quarantineGeneration.current = null;
    } else {
      // A previous exact-session sign-out intentionally leaves the process-wide
      // Push binder blocked. Only a freshly authenticated session whose canonical
      // deletion status is verified as clear may reopen it.
      unblockPushBindingOperations();
    }
    setLocalPurgeError(null);
  }, []);

  const applyCanonicalRequest = useCallback(async (
    pinned: Awaited<ReturnType<typeof pinCandidateSession>>,
    next: AccountDeletionRequest | null,
  ) => {
    if (!pinned || !pinned.isCurrent()) throw new Error('CANDIDATE_SESSION_CHANGED');
    setRequest(next);
    const policy = getAccountDeletionUiPolicy(next?.status ?? null);

    if (policy.quarantineCandidateDeviceState) {
      await ensureLocalQuarantine(pinned.ownerId);
      if (!pinned.isCurrent()) throw new Error('CANDIDATE_SESSION_CHANGED');
    } else {
      releaseLocalQuarantine();
    }
    return next;
  }, [ensureLocalQuarantine, pinCandidateSession, releaseLocalQuarantine]);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    setLoading(true);
    setLastError(null);
    try {
      const pinned = await pinCandidateSession();
      if (!pinned) throw new Error('ACCOUNT_DELETION_SESSION_UNAVAILABLE');
      const next = await getAccountDeletionRequest(pinned.client);
      if (generation !== refreshGeneration.current || !pinned.isCurrent()) {
        throw new Error('CANDIDATE_SESSION_CHANGED');
      }
      return await applyCanonicalRequest(pinned, next);
    } catch (error) {
      if (generation === refreshGeneration.current) setLastError(errorMessage(error));
      throw error;
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, [applyCanonicalRequest, pinCandidateSession]);

  const requestDeletion = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    try {
      const pinned = await pinCandidateAction();
      if (!pinned) throw new Error('ACCOUNT_DELETION_SESSION_UNAVAILABLE');
      const next = await requestAccountDeletion(pinned.client);
      if (!pinned.isCurrent()) throw new Error('CANDIDATE_SESSION_CHANGED');
      setRequest(next);
      await ensureLocalQuarantine(pinned.ownerId);
      if (!pinned.isCurrent()) throw new Error('CANDIDATE_SESSION_CHANGED');
      return next;
    } catch (error) {
      setLastError(errorMessage(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }, [ensureLocalQuarantine, pinCandidateAction]);

  const cancelDeletion = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    try {
      // Cancellation must remain available while the business/private-data gate
      // is intentionally closed, so pin the exact session rather than an action.
      const pinned = await pinCandidateSession();
      if (!pinned) throw new Error('ACCOUNT_DELETION_SESSION_UNAVAILABLE');
      const next = await cancelAccountDeletion(pinned.client);
      if (!pinned.isCurrent()) throw new Error('CANDIDATE_SESSION_CHANGED');
      setRequest(next);

      const policy = getAccountDeletionUiPolicy(next.status);
      if (policy.quarantineCandidateDeviceState) {
        await ensureLocalQuarantine(pinned.ownerId);
      } else {
        releaseLocalQuarantine();
      }
      return next;
    } catch (error) {
      setLastError(errorMessage(error));
      throw error;
    } finally {
      setBusy(false);
    }
  }, [ensureLocalQuarantine, pinCandidateSession, releaseLocalQuarantine]);

  const signOutSafely = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    const pinned = await pinCandidateSession();
    if (!pinned) {
      setBusy(false);
      return;
    }

    blockDurableMutationSession(pinned.ownerId, pinned.ownerSessionId);
    blockCandidateLocalStateSession(pinned.ownerId, pinned.ownerSessionId);

    try {
      if (quarantineGeneration.current == null) {
        quarantineGeneration.current = await quiescePushBindingOperations();
      }
      const generation = quarantineGeneration.current;

      await revokePush(pinned.client).catch(() => undefined);
      const results = await Promise.allSettled([
        purgeCandidatePrivateLocalState(pinned.ownerId),
        quarantineLocalPushIdentity(generation, { requirePresentationCleanup: true }),
      ]);
      const failed = results.find((result) => result.status === 'rejected');
      if (failed && failed.status === 'rejected') throw failed.reason;

      // Explicitly target the Clerk session that began cleanup. A delayed logout
      // must never terminate a newer Candidate B session.
      await signOut({ sessionId: pinned.ownerSessionId });
    } catch (error) {
      setLocalPurgeError(errorMessage(error));
      // If sign-out did not complete, let the same session retry. Deletion-state
      // quarantine stays active at the Push layer when applicable.
      if (!getAccountDeletionUiPolicy(request?.status ?? null).quarantineCandidateDeviceState) {
        const generation = quarantineGeneration.current;
        if (generation != null) unblockPushBindingOperations(generation);
        quarantineGeneration.current = null;
      }
      unblockDurableMutationSession(pinned.ownerId, pinned.ownerSessionId);
      unblockCandidateLocalStateSession(pinned.ownerId, pinned.ownerSessionId);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [pinCandidateSession, request?.status, signOut]);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  useEffect(() => () => {
    refreshGeneration.current += 1;
  }, []);

  const value = useMemo<AccountDeletionContextValue>(() => ({
    request,
    loading,
    busy,
    lastError,
    localPurgeError,
    refresh,
    requestDeletion,
    cancelDeletion,
    signOutSafely,
  }), [
    busy,
    cancelDeletion,
    lastError,
    loading,
    localPurgeError,
    refresh,
    request,
    requestDeletion,
    signOutSafely,
  ]);

  return (
    <AccountDeletionContext.Provider value={value}>
      {children}
    </AccountDeletionContext.Provider>
  );
}

export function AccountDeletionBoundary({ children }: PropsWithChildren) {
  const deletion = useAccountDeletion();
  return (
    <AccountDeletionGate
      request={deletion.request}
      loading={deletion.loading}
      busy={deletion.busy}
      lastError={deletion.lastError}
      localPurgeError={deletion.localPurgeError}
      onRefresh={deletion.refresh}
      onCancel={deletion.cancelDeletion}
      onSignOut={deletion.signOutSafely}
    >
      {children}
    </AccountDeletionGate>
  );
}

export function useAccountDeletion() {
  const value = useContext(AccountDeletionContext);
  if (!value) throw new Error('AccountDeletionProvider is required');
  return value;
}
