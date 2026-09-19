import { useClerk, useSession } from '@clerk/expo';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
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
import {
  ActivityIndicator,
  AppState,
  Button,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { blockDurableMutationSession, unblockDurableMutationSession } from '../lib/durableMutation';
import { blockCandidateLocalStateSession, unblockCandidateLocalStateSession } from '../lib/candidateLocalStateSession';
import {
  quarantineLocalPushIdentity,
  quiescePushBindingOperations,
  revokePush,
  unblockPushBindingOperations,
} from '../lib/notifications';
import { createNativeSupabase } from '../lib/supabase';
import { purgeCandidatePrivateLocalState } from '../lib/candidateLocalPrivacyPurge';

const APP_LOCK_KEY_PREFIX = 'hc.native.app-lock.v1:';
const APP_LOCK_BACKGROUND_GRACE_MS = 15_000;

type AppLockCapability = {
  checked: boolean;
  hardware: boolean;
  enrolled: boolean;
  securityLevel: number;
  authenticationTypes: number[];
  canEnable: boolean;
};

type AppLockValue = {
  enabled: boolean;
  locked: boolean;
  loading: boolean;
  authenticating: boolean;
  capability: AppLockCapability;
  lastError: string | null;
  shieldVisible: boolean;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  unlock: () => Promise<boolean>;
  lockNow: () => void;
};

const emptyCapability: AppLockCapability = {
  checked: false,
  hardware: false,
  enrolled: false,
  securityLevel: 0,
  authenticationTypes: [],
  canEnable: false,
};

const AppLockContext = createContext<AppLockValue | null>(null);

function preferenceKey(userId: string) {
  return `${APP_LOCK_KEY_PREFIX}${userId}`;
}

async function readCapability(): Promise<AppLockCapability> {
  const [hardware, enrolled, securityLevel, authenticationTypes] =
    await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

  return {
    checked: true,
    hardware,
    enrolled,
    securityLevel: Number(securityLevel || 0),
    authenticationTypes: authenticationTypes.map(Number),
    canEnable: hardware && enrolled && Number(securityLevel || 0) >= 3,
  };
}

async function authenticateDevice() {
  return LocalAuthentication.authenticateAsync({
    promptMessage: 'Hoiku Colorのロックを解除',
    promptSubtitle: '求人・応募情報を表示します',
    cancelLabel: 'キャンセル',
    fallbackLabel: 'パスコードを使用',
    biometricsSecurityLevel: 'strong',
    disableDeviceFallback: false,
    requireConfirmation: true,
  });
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const { session } = useSession();
  const { signOut } = useClerk();
  const userId = session?.user?.id ?? null;
  const activeSession = Boolean(userId && session?.id && session.status === 'active');
  const signOutIdentityRef = useRef({
    userId,
    sessionId: session?.id ?? null,
  });
  signOutIdentityRef.current = { userId, sessionId: session?.id ?? null };
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  // Authenticated Native state starts fail-closed. The stored App Lock
  // preference is asynchronous, so children must never get one unlocked frame
  // before SecureStore/capability bootstrap resolves.
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [privacyCovered, setPrivacyCovered] = useState(true);
  const [capability, setCapability] = useState<AppLockCapability>(emptyCapability);
  const [lastError, setLastError] = useState<string | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const promptGeneration = useRef(0);
  const lastAutoPromptGeneration = useRef(-1);

  const refreshCapability = useCallback(async () => {
    try {
      const next = await readCapability();
      setCapability(next);
      return next;
    } catch (error) {
      const next = { ...emptyCapability, checked: true };
      setCapability(next);
      setLastError(String((error as { message?: unknown })?.message ?? error));
      return next;
    }
  }, []);

  const lockNow = useCallback(() => {
    if (!enabled || !activeSession) return;
    promptGeneration.current += 1;
    setPrivacyCovered(true);
    setLocked(true);
  }, [activeSession, enabled]);

  const unlock = useCallback(async () => {
    if (!enabled || !activeSession) {
      setLocked(false);
      setPrivacyCovered(false);
      return true;
    }
    if (authenticating) return false;

    setAuthenticating(true);
    setLastError(null);
    try {
      const latestCapability = await refreshCapability();
      if (!latestCapability.canEnable) {
        setLastError(
          latestCapability.securityLevel === 2
            ? 'この端末の生体認証は強度要件（Android Class 3）を満たしていません。'
            : '端末に利用可能な生体認証が登録されていません。',
        );
        return false;
      }
      const result = await authenticateDevice();
      if (!result.success) {
        if (!['user_cancel', 'system_cancel', 'app_cancel'].includes(result.error)) {
          setLastError(`端末認証に失敗しました（${result.error}）。`);
        }
        return false;
      }
      setLocked(false);
      setPrivacyCovered(false);
      return true;
    } catch (error) {
      setLastError(String((error as { message?: unknown })?.message ?? error));
      return false;
    } finally {
      setAuthenticating(false);
    }
  }, [activeSession, authenticating, enabled, refreshCapability]);

  const setEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!userId) return false;
      setLoading(true);
      setLastError(null);
      try {
        if (!nextEnabled) {
          await SecureStore.deleteItemAsync(preferenceKey(userId));
          setEnabledState(false);
          setLocked(false);
          setPrivacyCovered(false);
          return true;
        }

        const latestCapability = await refreshCapability();
        if (!latestCapability.canEnable) {
          setLastError(
            latestCapability.securityLevel === 2
              ? 'この端末の生体認証は強度要件（Android Class 3）を満たしていません。指紋または3D顔認証などの強い生体認証を設定してください。'
              : 'Face ID・指紋などの強い生体認証を端末で設定してください。',
          );
          return false;
        }

        const result = await authenticateDevice();
        if (!result.success) {
          if (!['user_cancel', 'system_cancel', 'app_cancel'].includes(result.error)) {
            setLastError(`端末認証に失敗しました（${result.error}）。`);
          }
          return false;
        }

        await SecureStore.setItemAsync(preferenceKey(userId), 'enabled');
        setEnabledState(true);
        setLocked(false);
        setPrivacyCovered(false);
        return true;
      } catch (error) {
        setLastError(String((error as { message?: unknown })?.message ?? error));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [refreshCapability, userId],
  );

  const pinSessionForSignOut = useCallback(async () => {
    const ownerId = userId;
    const ownerSessionId = session?.id ?? null;
    if (!ownerId || !ownerSessionId || !session || session.status !== 'active') return null;

    const token = await session.getToken();
    const current = signOutIdentityRef.current;
    if (
      !token ||
      current.userId !== ownerId ||
      current.sessionId !== ownerSessionId
    ) {
      return null;
    }

    return {
      ownerId,
      ownerSessionId,
      client: createNativeSupabase(async () => token),
    };
  }, [session, userId]);

  const secureSignOut = useCallback(async () => {
    const pinned = await pinSessionForSignOut();
    if (!pinned) return;

    blockDurableMutationSession(pinned.ownerId, pinned.ownerSessionId);
    blockCandidateLocalStateSession(pinned.ownerId, pinned.ownerSessionId);
    const pushBindingGeneration = await quiescePushBindingOperations();
    try {
      await revokePush(pinned.client).catch(() => undefined);
      // Candidate-private state and the App Lock preference must be physically
      // cleared before Clerk sign-out. A rejected delete keeps the privacy shield
      // on the current session instead of silently handing a shared device onward.
      await Promise.all([
        purgeCandidatePrivateLocalState(pinned.ownerId),
        SecureStore.deleteItemAsync(preferenceKey(pinned.ownerId)),
      ]);
      await quarantineLocalPushIdentity(pushBindingGeneration, {
        requirePresentationCleanup: true,
      });

      const current = signOutIdentityRef.current;
      if (
        current.userId === pinned.ownerId &&
        current.sessionId === pinned.ownerSessionId
      ) {
        setEnabledState(false);
        setLocked(false);
        setPrivacyCovered(false);
      }

      // Target the launch session explicitly. A delayed App Lock logout must not
      // sign out a newer candidate session that became active while cleanup ran.
      await signOut({ sessionId: pinned.ownerSessionId });
    } catch (error) {
      unblockPushBindingOperations(pushBindingGeneration);
      unblockDurableMutationSession(pinned.ownerId, pinned.ownerSessionId);
      unblockCandidateLocalStateSession(pinned.ownerId, pinned.ownerSessionId);
      setLastError('端末内の応募・通知情報を安全に整理できませんでした。もう一度お試しください。');
    }
  }, [pinSessionForSignOut, signOut]);

  useEffect(() => {
    let cancelled = false;
    setCapability(emptyCapability);
    setLastError(null);

    if (!userId || !activeSession) {
      setEnabledState(false);
      setLocked(false);
      setPrivacyCovered(false);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setPrivacyCovered(true);
    void Promise.all([
      SecureStore.getItemAsync(preferenceKey(userId)),
      readCapability().catch(() => ({ ...emptyCapability, checked: true })),
    ]).then(([stored, nextCapability]) => {
      if (cancelled) return;
      const nextEnabled = stored === 'enabled';
      setCapability(nextCapability);
      setEnabledState(nextEnabled);
      if (nextEnabled) {
        promptGeneration.current += 1;
        setLocked(true);
        setPrivacyCovered(true);
      } else {
        setLocked(false);
        setPrivacyCovered(false);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeSession, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appState.current;
      appState.current = nextState;

      if (!activeSession) return;

      if (nextState === 'background' || nextState === 'inactive') {
        if (previous === 'active') backgroundedAt.current = Date.now();
        setPrivacyCovered(true);
        return;
      }

      if (nextState === 'active') {
        const awaySince = backgroundedAt.current;
        backgroundedAt.current = null;
        if (
          enabled &&
          awaySince != null &&
          Date.now() - awaySince >= APP_LOCK_BACKGROUND_GRACE_MS
        ) {
          promptGeneration.current += 1;
          setLocked(true);
          setPrivacyCovered(true);
          return;
        }
        if (!locked) setPrivacyCovered(false);
      }
    });
    return () => subscription.remove();
  }, [activeSession, enabled, locked]);

  useEffect(() => {
    if (
      !activeSession ||
      !enabled ||
      !locked ||
      loading ||
      AppState.currentState !== 'active'
    ) return;
    const generation = promptGeneration.current;
    if (lastAutoPromptGeneration.current === generation) return;
    lastAutoPromptGeneration.current = generation;
    void unlock();
  }, [activeSession, enabled, loading, locked, unlock]);

  const shieldVisible = activeSession && (loading || locked || privacyCovered);

  const value = useMemo<AppLockValue>(
    () => ({
      enabled,
      locked,
      loading,
      authenticating,
      capability,
      lastError,
      shieldVisible,
      setEnabled,
      unlock,
      lockNow,
    }),
    [
      authenticating,
      capability,
      enabled,
      lastError,
      loading,
      lockNow,
      shieldVisible,
      locked,
      setEnabled,
      unlock,
    ],
  );

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {shieldVisible ? (
        <View
          testID="app-lock-shield"
          accessibilityViewIsModal
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 9999,
            elevation: 9999,
            backgroundColor: '#fff',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 28,
            gap: 14,
          }}
        >
          {loading ? (
            <>
              <ActivityIndicator />
              <Text>セキュリティ設定を確認しています…</Text>
            </>
          ) : locked ? (
            <>
              <Text style={{ fontSize: 24, fontWeight: '700' }}>Hoiku Color</Text>
              <Text style={{ textAlign: 'center' }}>
                求人・応募情報を表示するには端末認証でロックを解除してください。
              </Text>
              {lastError ? <Text style={{ color: '#b42318' }}>{lastError}</Text> : null}
              <Button
                testID="app-lock-unlock"
                title={authenticating ? '確認中…' : 'Face ID・指紋で解除'}
                disabled={authenticating}
                onPress={() => void unlock()}
              />
              <Button
                testID="app-lock-signout"
                title="ログアウトして再ログイン"
                onPress={() => void secureSignOut()}
              />
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      ) : null}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const value = useContext(AppLockContext);
  if (!value) throw new Error('AppLockProvider is required');
  return value;
}
