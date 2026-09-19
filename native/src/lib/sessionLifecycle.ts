import { useSession } from '@clerk/expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const TERMINAL_SESSION_STATUSES = new Set([
  'expired',
  'ended',
  'abandoned',
  'removed',
  'replaced',
  'revoked',
]);

function looksOffline(error: unknown) {
  const name = String((error as { name?: unknown } | null)?.name ?? '');
  const text = String((error as { message?: unknown } | null)?.message ?? error ?? '').toLowerCase();
  return name === 'ClerkOfflineError' || /offline|network|fetch|timeout|connection/.test(text);
}

type ForegroundSessionFreshness = {
  checking: boolean;
  blocked: boolean;
  lastRefreshError: string | null;
  refreshNow: () => Promise<boolean>;
};

/**
 * Force a fresh Clerk session token whenever an authenticated app returns to the
 * foreground. A non-network refresh failure is security-significant: until Clerk
 * either confirms the exact launch session or transitions auth state away from it,
 * the authenticated Native subtree must remain fail-closed.
 *
 * Offline is intentionally different. The app does not manufacture a sign-out just
 * because Clerk cannot be reached; ReleaseGate/AppLock continue to decide which
 * already-verified/offline-safe UI may remain available.
 */
export function useForegroundSessionRefresh(): ForegroundSessionFreshness {
  const sessionState = useSession();
  const isSignedIn = sessionState.isSignedIn;
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const generation = useRef(0);
  const mountedRef = useRef(true);
  const identityRef = useRef({
    signedIn: Boolean(isSignedIn),
    userId: sessionState.session?.user?.id ?? null,
    sessionId: sessionState.session?.id ?? null,
    status: sessionState.session?.status ?? null,
  });
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);
  const blockedRef = useRef(false);

  identityRef.current = {
    signedIn: Boolean(isSignedIn),
    userId: sessionState.session?.user?.id ?? null,
    sessionId: sessionState.session?.id ?? null,
    status: sessionState.session?.status ?? null,
  };

  useEffect(() => () => {
    mountedRef.current = false;
    generation.current += 1;
  }, []);

  const refreshNow = useCallback(async () => {
    const launchSession = sessionState.session;
    const launchIdentity = identityRef.current;
    if (
      !launchSession ||
      !launchIdentity.signedIn ||
      !launchIdentity.userId ||
      !launchIdentity.sessionId ||
      launchIdentity.status !== 'active' ||
      launchSession.id !== launchIdentity.sessionId ||
      launchSession.user?.id !== launchIdentity.userId
    ) {
      return false;
    }

    const currentGeneration = ++generation.current;
    setChecking(true);
    try {
      const token = await launchSession.getToken({ skipCache: true });
      if (!mountedRef.current || currentGeneration !== generation.current) return false;

      const currentIdentity = identityRef.current;
      const sameSession =
        currentIdentity.signedIn &&
        currentIdentity.status === 'active' &&
        currentIdentity.userId === launchIdentity.userId &&
        currentIdentity.sessionId === launchIdentity.sessionId &&
        sessionState.session === launchSession;

      if (!sameSession) return false;

      if (!token) {
        blockedRef.current = true;
        setBlocked(true);
        setLastRefreshError('SESSION_NOT_ACTIVE');
        return false;
      }

      blockedRef.current = false;
      setBlocked(false);
      setLastRefreshError(null);
      return true;
    } catch (error) {
      if (!mountedRef.current || currentGeneration !== generation.current) return false;

      const currentIdentity = identityRef.current;
      const sameSession =
        currentIdentity.signedIn &&
        currentIdentity.status === 'active' &&
        currentIdentity.userId === launchIdentity.userId &&
        currentIdentity.sessionId === launchIdentity.sessionId &&
        sessionState.session === launchSession;
      if (!sameSession) return false;

      if (looksOffline(error)) {
        // Preserve the current Clerk session during a pure connectivity outage.
        // ReleaseGate performs the separate same-process compatibility decision.
        if (!blockedRef.current) setBlocked(false);
        setLastRefreshError('OFFLINE');
        return false;
      }

      blockedRef.current = true;
      setBlocked(true);
      setLastRefreshError(
        String((error as { message?: unknown } | null)?.message ?? error ?? 'SESSION_REFRESH_FAILED'),
      );
      return false;
    } finally {
      if (mountedRef.current && currentGeneration === generation.current) {
        setChecking(false);
      }
    }
  }, [sessionState.session]);

  useEffect(() => {
    const active = Boolean(
      isSignedIn &&
      sessionState.session?.id &&
      sessionState.session.status === 'active',
    );

    if (!active) {
      generation.current += 1;
      setChecking(false);
      blockedRef.current = false;
      setBlocked(false);
      setLastRefreshError(null);
    }
  }, [isSignedIn, sessionState.session?.id, sessionState.session?.status]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appState.current;
      appState.current = nextState;
      if (!previous.match(/background|inactive/) || nextState !== 'active') return;
      void refreshNow();
    });

    return () => subscription.remove();
  }, [refreshNow]);

  return { checking, blocked, lastRefreshError, refreshNow };
}

export function useActiveClerkSession() {
  const sessionState = useSession();
  const session = sessionState.session ?? null;
  const status = session?.status ?? null;
  const terminal = status != null && TERMINAL_SESSION_STATUSES.has(status);
  const userId = session?.user?.id ?? null;
  const sessionId = session?.id ?? null;
  const signedIn = Boolean(sessionState.isSignedIn);

  return {
    isLoaded: sessionState.isLoaded,
    isSignedIn: signedIn,
    userId,
    sessionId,
    status,
    terminal,
    active: Boolean(
      signedIn &&
      status === 'active' &&
      userId &&
      sessionId
    ),
  };
}
