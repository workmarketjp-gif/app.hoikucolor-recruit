import { useSession } from '@clerk/expo';
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
import { ActivityIndicator, AppState, Button, Linking, Text, View, type AppStateStatus } from 'react-native';
import { getNativeReleaseIdentity } from '../lib/appIdentity';
import {
  getMobileReleaseCompatibility,
  type MobileReleaseCompatibility,
} from '../lib/mobileReleaseApi';
import { createNativeSupabase } from '../lib/supabase';

const OFFLINE_PATTERN = /offline|network|fetch|timeout|connection/i;

type ReleaseCompatibilityContextValue = {
  compatibility: MobileReleaseCompatibility | null;
  checking: boolean;
  lastError: string | null;
  offlineUsingLastVerified: boolean;
  refresh: () => Promise<boolean>;
};

const ReleaseCompatibilityContext = createContext<ReleaseCompatibilityContextValue | null>(null);

function errorMessage(error: unknown) {
  return String((error as { message?: unknown } | null)?.message ?? error ?? 'UNKNOWN_ERROR');
}

function looksOffline(error: unknown) {
  const name = String((error as { name?: unknown } | null)?.name ?? '');
  return name === 'ClerkOfflineError' || OFFLINE_PATTERN.test(errorMessage(error));
}

function ReleaseBlocked({
  title,
  detail,
  retry,
  storeUrl,
}: {
  title: string;
  detail: string;
  retry: () => Promise<boolean>;
  storeUrl?: string | null;
}) {
  return (
    <View
      testID="release-compatibility-blocked"
      accessibilityViewIsModal
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}
    >
      <Text style={{ fontSize: 22, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      <Text style={{ textAlign: 'center' }}>{detail}</Text>
      {storeUrl ? (
        <Button
          testID="release-compatibility-update"
          title="アプリを更新"
          onPress={() => void Linking.openURL(storeUrl)}
        />
      ) : null}
      <Button testID="release-compatibility-retry" title="再確認" onPress={() => void retry()} />
    </View>
  );
}

export function ReleaseCompatibilityProvider({ children }: PropsWithChildren) {
  const sessionState = useSession();
  const session = sessionState.session ?? null;
  const [compatibility, setCompatibility] = useState<MobileReleaseCompatibility | null>(null);
  const [checking, setChecking] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [offlineUsingLastVerified, setOfflineUsingLastVerified] = useState(false);
  const generation = useRef(0);
  const mountedRef = useRef(true);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const compatibilityRef = useRef<MobileReleaseCompatibility | null>(null);
  const identityRef = useRef({
    userId: session?.user?.id ?? null,
    sessionId: session?.id ?? null,
    status: session?.status ?? null,
  });
  const lastVerifiedAllowedRef = useRef(false);

  compatibilityRef.current = compatibility;
  identityRef.current = {
    userId: session?.user?.id ?? null,
    sessionId: session?.id ?? null,
    status: session?.status ?? null,
  };

  useEffect(() => () => {
    mountedRef.current = false;
    generation.current += 1;
  }, []);

  const refresh = useCallback(async () => {
    const launchSession = session;
    const launchIdentity = identityRef.current;
    if (
      !launchSession ||
      launchIdentity.status !== 'active' ||
      !launchIdentity.userId ||
      !launchIdentity.sessionId ||
      launchSession.id !== launchIdentity.sessionId ||
      launchSession.user?.id !== launchIdentity.userId
    ) {
      setCompatibility(null);
      setLastError('RELEASE_SESSION_UNAVAILABLE');
      setOfflineUsingLastVerified(false);
      setChecking(false);
      lastVerifiedAllowedRef.current = false;
      return false;
    }

    const currentGeneration = ++generation.current;
    setChecking(true);
    setLastError(null);
    setOfflineUsingLastVerified(false);

    try {
      const releaseIdentity = getNativeReleaseIdentity();
      const token = await launchSession.getToken();
      if (!token) throw new Error('RELEASE_SESSION_TOKEN_UNAVAILABLE');

      const client = createNativeSupabase(async () => token);
      const next = await getMobileReleaseCompatibility(client, releaseIdentity);

      const current = identityRef.current;
      const sameSession =
        mountedRef.current &&
        currentGeneration === generation.current &&
        current.status === 'active' &&
        current.userId === launchIdentity.userId &&
        current.sessionId === launchIdentity.sessionId &&
        session === launchSession;
      if (!sameSession) return false;

      setCompatibility(next);
      setLastError(null);
      setOfflineUsingLastVerified(false);
      lastVerifiedAllowedRef.current = next.configured && next.allowed;
      return next.configured && next.allowed;
    } catch (error) {
      if (!mountedRef.current || currentGeneration !== generation.current) return false;

      const current = identityRef.current;
      const sameSession =
        current.status === 'active' &&
        current.userId === launchIdentity.userId &&
        current.sessionId === launchIdentity.sessionId &&
        session === launchSession;
      if (!sameSession) return false;

      const previous = compatibilityRef.current;
      if (looksOffline(error) && lastVerifiedAllowedRef.current && previous?.configured && previous.allowed) {
        // Same-process, exact-session continuity only. A cold launch never assumes
        // compatibility while offline, and a previously blocked release never opens.
        setLastError('OFFLINE');
        setOfflineUsingLastVerified(true);
        return true;
      }

      setCompatibility(null);
      setLastError(errorMessage(error));
      setOfflineUsingLastVerified(false);
      lastVerifiedAllowedRef.current = false;
      return false;
    } finally {
      if (mountedRef.current && currentGeneration === generation.current) setChecking(false);
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appState.current;
      appState.current = nextState;
      if (!previous.match(/background|inactive/) || nextState !== 'active') return;
      void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const value = useMemo<ReleaseCompatibilityContextValue>(() => ({
    compatibility,
    checking,
    lastError,
    offlineUsingLastVerified,
    refresh,
  }), [compatibility, checking, lastError, offlineUsingLastVerified, refresh]);

  return (
    <ReleaseCompatibilityContext.Provider value={value}>
      {children}
    </ReleaseCompatibilityContext.Provider>
  );
}

export function ReleaseCompatibilityBoundary({ children }: PropsWithChildren) {
  const release = useReleaseCompatibility();
  const compatibility = release.compatibility;

  if (release.checking && !compatibility) {
    return (
      <View testID="release-compatibility-bootstrap" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator />
        <Text>アプリとサーバーの互換性を確認しています…</Text>
      </View>
    );
  }

  if (!compatibility) {
    return (
      <ReleaseBlocked
        title="アプリの利用準備を確認できません"
        detail="安全のため、応募・メッセージ・書類などを表示していません。通信環境を確認して再度お試しください。"
        retry={release.refresh}
      />
    );
  }

  if (!compatibility.configured) {
    return (
      <ReleaseBlocked
        title="アプリの利用準備中です"
        detail="このバージョンの利用設定がまだ完了していません。"
        retry={release.refresh}
      />
    );
  }

  if (!compatibility.allowed) {
    const backendTooOld = compatibility.message === 'APP_BACKEND_CONTRACT_TOO_OLD';
    const updateRequired = compatibility.forceUpdate ||
      compatibility.message === 'APP_CLIENT_CONTRACT_TOO_OLD' ||
      compatibility.message === 'APP_UPDATE_REQUIRED';
    const title = compatibility.maintenanceMode
      ? 'メンテナンス中です'
      : backendTooOld
        ? 'サーバー更新を確認しています'
        : updateRequired
          ? 'アプリの更新が必要です'
          : 'このバージョンは現在利用できません';
    const detail = compatibility.maintenanceMode
      ? (compatibility.message || 'メンテナンス完了後に再度お試しください。')
      : backendTooOld
        ? 'このアプリに対応するサーバー版がまだ利用できません。更新完了後に再確認してください。'
        : updateRequired
          ? '安全に利用を続けるため、最新バージョンへ更新してください。'
          : 'アプリとサーバーの互換性を確認できませんでした。';

    return (
      <ReleaseBlocked
        title={title}
        detail={detail}
        retry={release.refresh}
        storeUrl={updateRequired ? compatibility.storeUrl : null}
      />
    );
  }

  return <>{children}</>;
}

export function useReleaseCompatibility() {
  const value = useContext(ReleaseCompatibilityContext);
  if (!value) throw new Error('ReleaseCompatibilityProvider is required');
  return value;
}
