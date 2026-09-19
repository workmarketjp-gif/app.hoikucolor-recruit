import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { AccountDeletionBoundary, AccountDeletionProvider } from '../contexts/AccountDeletionContext';
import { AppLockProvider } from '../contexts/AppLockContext';
import { DocumentPickerCacheBoundary } from '../contexts/DocumentPickerCacheBoundary';
import { NotificationProvider } from '../contexts/NotificationContext';
import { SessionFreshnessProvider } from '../contexts/SessionFreshnessContext';
import { useActiveClerkSession } from '../lib/sessionLifecycle';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function RouterStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function CenteredStatus({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
      <ActivityIndicator />
      <Text style={{ fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {detail ? <Text style={{ textAlign: 'center' }}>{detail}</Text> : null}
    </View>
  );
}

function AuthScopedRuntime() {
  const auth = useActiveClerkSession();

  if (!auth.isLoaded) {
    return <CenteredStatus title="ログイン状態を確認しています…" />;
  }

  // Candidate-private providers never mount while signed out. Sign-in/sign-up
  // routes remain available through the same Expo Router tree.
  if (!auth.isSignedIn) return <RouterStack />;

  if (!auth.active || !auth.sessionId) {
    return (
      <CenteredStatus
        title="ログイン状態を確認しています…"
        detail="安全のため、応募・メッセージ・書類は表示していません。"
      />
    );
  }

  // Key the complete private runtime by the exact Clerk session. Candidate A -> B
  // replacement therefore tears down pending notification/deletion state before B
  // can mount.
  return (
    <SessionFreshnessProvider key={auth.sessionId}>
      <AppLockProvider>
        <AccountDeletionProvider>
          <AccountDeletionBoundary>
            <NotificationProvider>
              <RouterStack />
            </NotificationProvider>
          </AccountDeletionBoundary>
        </AccountDeletionProvider>
      </AppLockProvider>
    </SessionFreshnessProvider>
  );
}

export default function RootLayout() {
  if (!publishableKey) {
    return (
      <View
        testID="clerk-config-missing"
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
          アプリ設定を確認できません
        </Text>
        <Text style={{ textAlign: 'center' }}>
          ログイン設定が不足しているため、個人情報を表示せず停止しています。
        </Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <DocumentPickerCacheBoundary>
        <AuthScopedRuntime />
      </DocumentPickerCacheBoundary>
    </ClerkProvider>
  );
}
