import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router';
import { reloadAppAsync } from 'expo';
import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { DocumentPickerCacheBoundary } from '../contexts/DocumentPickerCacheBoundary';
import { loadHoikuColorClerkPublishableKey } from '../lib/clerkConfig';
import { useActiveClerkSession } from '../lib/sessionLifecycle';
import { bootLog } from '../lib/bootDiagnostics';
import { BuildDiagnostics } from '../components/BuildDiagnostics';

const PrivateRuntime = lazy(() =>
  import('../components/PrivateRuntime').then((module) => ({ default: module.PrivateRuntime })),
);

const AUTH_LOAD_TIMEOUT_MS = 10000;
const brandMark = require('../../assets/hoiku-color-mark.png');

function RouterStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function ClerkMountProbe() {
  useEffect(() => { bootLog('HC_CLERK_PROVIDER_MOUNTED'); }, []);
  return null;
}

class StartupErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { bootLog('HC_CLERK_PROVIDER_ERROR'); }
  render() {
    return this.state.failed ? <CenteredStatus title="ログイン接続を確認できません" detail="ログインの初期化に失敗しました。通信環境を確認して再試行してください。" action="再確認" onAction={this.props.onRetry} /> : this.props.children;
  }
}

function CenteredStatus({
  title,
  detail,
  loading = false,
  action,
  onAction,
  testID,
}: {
  title: string;
  detail?: string;
  loading?: boolean;
  action?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        gap: 14,
        backgroundColor: '#FFF8FA',
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 24,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image source={brandMark} style={{ width: 62, height: 62 }} resizeMode="contain" />
      </View>
      {loading ? <ActivityIndicator color="#FF2F5F" /> : null}
      <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center', color: '#16181D' }}>
        {title}
      </Text>
      {detail ? (
        <Text style={{ fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#5C626B' }}>
          {detail}
        </Text>
      ) : null}
      {action && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{
            minHeight: 52,
            paddingHorizontal: 22,
            borderRadius: 14,
            backgroundColor: '#FF2F5F',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{action}</Text>
        </Pressable>
      ) : null}
      <BuildDiagnostics />
    </View>
  );
}

function AuthScopedRuntime({ onRetry, onReady }: { onRetry: () => void; onReady: () => void }) {
  const auth = useActiveClerkSession();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (auth.isLoaded && (!auth.isSignedIn || auth.active)) {
      setTimedOut(false);
      onReady();
      return;
    }
    const timer = setTimeout(() => { bootLog('HC_CLERK_LOAD_TIMEOUT'); setTimedOut(true); }, AUTH_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [auth.isLoaded, auth.isSignedIn, auth.active, onReady]);

  useEffect(() => {
    if (auth.isLoaded) bootLog('HC_CLERK_LOADED');
    if (auth.isLoaded) bootLog(auth.isSignedIn ? 'HC_CLERK_SIGNED_IN' : 'HC_CLERK_SIGNED_OUT');
  }, [auth.isLoaded, auth.isSignedIn]);

  if (timedOut) return <CenteredStatus testID="clerk-load-timeout" title="ログイン接続を確認できません" detail="ログイン状態の確認が時間内に完了しませんでした。通信環境を確認して再試行してください。" action="再確認" onAction={onRetry} />;

  if (!auth.isLoaded) {
    return <CenteredStatus title="ログイン状態を確認しています…" loading />;
  }

  // Candidate-private providers never mount while signed out. This also keeps
  // Clerk initialization isolated from notifications, biometrics and private DB
  // modules until a real active session exists.
  if (!auth.isSignedIn) return <RouterStack />;

  if (!auth.active || !auth.sessionId) {
    return (
      <CenteredStatus
        title="ログイン状態を確認しています…"
        detail="安全のため、応募・メッセージ・書類は表示していません。"
        loading
      />
    );
  }

  return (
    <Suspense fallback={<CenteredStatus title="アプリを準備しています…" loading />}>
      <PrivateRuntime sessionId={auth.sessionId}>
        <RouterStack />
      </PrivateRuntime>
    </Suspense>
  );
}

export default function RootLayout() {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [bootReady, setBootReady] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const onReady = useCallback(() => setBootReady(true), []);

  // This timer must commit OUTSIDE Clerk, the cache boundary and Suspense.
  // It covers a provider that never renders children and incomplete hydration.
  useEffect(() => {
    if (bootReady || configError) return;
    const timer = setTimeout(() => { bootLog('HC_CLERK_LOAD_TIMEOUT'); setBootTimedOut(true); }, 17000);
    return () => clearTimeout(timer);
  }, [bootReady, configError]);

  useEffect(() => {
    bootLog('HC_NATIVE_BOOT_START');
    let active = true;
    setPublishableKey(null);
    setConfigError(null);
    loadHoikuColorClerkPublishableKey()
      .then((key) => {
        if (active) setPublishableKey(key);
      })
      .catch((error) => {
        if (active) {
          bootLog('HC_CLERK_CONFIG_FAILED');
          setConfigError(error instanceof Error && error.message === 'CLERK_CONFIG_INSTANCE_MISMATCH'
            ? 'Webとアプリのログイン設定が一致しません。アプリを更新するか、サポートへお問い合わせください。'
            : 'ログイン設定を取得できませんでした。通信環境を確認して再試行してください。');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Clerk Expo caches its instance at module scope. Remounting the provider with
  // the same key reuses that instance/load promise; restart JS instead.
  const retryClerk = useCallback(() => {
    bootLog('HC_NATIVE_BOOT_RETRY');
    void reloadAppAsync().catch(() => setConfigError('アプリを再起動して、もう一度お試しください。'));
  }, []);

  if (bootTimedOut) return <CenteredStatus testID="clerk-load-timeout" title="ログイン接続を確認できません" detail="初期化が時間内に完了しませんでした。通信環境を確認して再試行してください。" action="再確認" onAction={retryClerk} />;

  if (configError) {
    return (
      <CenteredStatus
        testID="clerk-config-missing"
        title="ログイン設定を読み込めませんでした"
        detail={configError}
        action="再確認"
        onAction={retryClerk}
      />
    );
  }

  if (!publishableKey) {
    return <CenteredStatus title="Hoiku Colorを準備しています…" loading />;
  }

  return (
    <StartupErrorBoundary onRetry={retryClerk}>
      <Suspense fallback={<CenteredStatus title="ログイン状態を確認しています…" loading />}>
        <ClerkProvider
          key={publishableKey}
          publishableKey={publishableKey}
          tokenCache={tokenCache}
        >
          <ClerkMountProbe />
          <DocumentPickerCacheBoundary>
            <AuthScopedRuntime onRetry={retryClerk} onReady={onReady} />
          </DocumentPickerCacheBoundary>
        </ClerkProvider>
      </Suspense>
    </StartupErrorBoundary>
  );
}
