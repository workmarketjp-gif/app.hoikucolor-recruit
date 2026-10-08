import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { DocumentPickerCacheBoundary } from '../contexts/DocumentPickerCacheBoundary';
import { loadHoikuColorClerkPublishableKey } from '../lib/clerkConfig';
import { useActiveClerkSession } from '../lib/sessionLifecycle';

const PrivateRuntime = lazy(() =>
  import('../components/PrivateRuntime').then((module) => ({ default: module.PrivateRuntime })),
);

const AUTH_LOAD_TIMEOUT_MS = 10000;
const brandMark = require('../../assets/hoiku-color-mark.png');

function RouterStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
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
    </View>
  );
}

function AuthScopedRuntime({ onRetry }: { onRetry: () => void }) {
  const auth = useActiveClerkSession();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (auth.isLoaded) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), AUTH_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [auth.isLoaded]);

  if (!auth.isLoaded) {
    if (timedOut) {
      return (
        <CenteredStatus
          testID="clerk-load-timeout"
          title="ログイン接続を確認できません"
          detail="通信またはログイン設定の読み込みに時間がかかっています。再確認しても進まない場合は、アプリ側で原因を確認します。"
          action="再確認"
          onAction={onRetry}
        />
      );
    }
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
  const [configEpoch, setConfigEpoch] = useState(0);
  const [providerEpoch, setProviderEpoch] = useState(0);

  useEffect(() => {
    let active = true;
    setPublishableKey(null);
    setConfigError(null);
    loadHoikuColorClerkPublishableKey()
      .then((key) => {
        if (active) setPublishableKey(key);
      })
      .catch((error) => {
        if (active) {
          setConfigError(String((error as { message?: unknown } | null)?.message ?? error));
        }
      });
    return () => {
      active = false;
    };
  }, [configEpoch]);

  const retryConfig = useCallback(() => setConfigEpoch((value) => value + 1), []);
  const retryClerk = useCallback(() => setProviderEpoch((value) => value + 1), []);

  if (configError) {
    return (
      <CenteredStatus
        testID="clerk-config-missing"
        title="ログイン設定を読み込めませんでした"
        detail={configError}
        action="再確認"
        onAction={retryConfig}
      />
    );
  }

  if (!publishableKey) {
    return <CenteredStatus title="Hoiku Colorを準備しています…" loading />;
  }

  return (
    <ClerkProvider
      key={`${providerEpoch}:${publishableKey}`}
      publishableKey={publishableKey}
      tokenCache={tokenCache}
    >
      <DocumentPickerCacheBoundary>
        <AuthScopedRuntime onRetry={retryClerk} />
      </DocumentPickerCacheBoundary>
    </ClerkProvider>
  );
}
