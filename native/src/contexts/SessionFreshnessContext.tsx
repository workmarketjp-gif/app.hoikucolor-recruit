import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { useForegroundSessionRefresh } from '../lib/sessionLifecycle';

type SessionFreshnessValue = {
  shieldVisible: boolean;
  checking: boolean;
  blocked: boolean;
  lastRefreshError: string | null;
  refresh: () => Promise<boolean>;
};

const SessionFreshnessContext = createContext<SessionFreshnessValue | null>(null);

export function SessionFreshnessProvider({ children }: PropsWithChildren<{ key?: string }>) {
  const freshness = useForegroundSessionRefresh();
  const shieldVisible = freshness.checking || freshness.blocked;
  const value = useMemo(
    () => ({
      shieldVisible,
      checking: freshness.checking,
      blocked: freshness.blocked,
      lastRefreshError: freshness.lastRefreshError,
      refresh: freshness.refreshNow,
    }),
    [freshness.blocked, freshness.checking, freshness.lastRefreshError, freshness.refreshNow, shieldVisible],
  );

  return (
    <SessionFreshnessContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {shieldVisible ? (
          <View
            testID={freshness.blocked ? 'session-foreground-refresh-blocked' : 'session-foreground-refresh-shield'}
            accessibilityViewIsModal
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 12000,
              elevation: 12000,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 28,
              gap: 12,
              backgroundColor: '#fff',
            }}
          >
            {freshness.checking ? <ActivityIndicator /> : null}
            <Text style={{ fontSize: freshness.blocked ? 20 : 18, fontWeight: '800', textAlign: 'center' }}>
              {freshness.blocked ? 'ログイン状態を再確認してください' : 'ログイン状態を確認しています'}
            </Text>
            {freshness.blocked ? (
              <>
                <Text style={{ textAlign: 'center' }}>
                  安全のため応募・メッセージ・個人情報を一時的に表示していません。
                </Text>
                <Button
                  testID="session-foreground-refresh-retry"
                  title="再確認"
                  onPress={() => void freshness.refreshNow()}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </SessionFreshnessContext.Provider>
  );
}

export function useSessionFreshness() {
  const value = useContext(SessionFreshnessContext);
  if (!value) throw new Error('SessionFreshnessProvider is required');
  return value;
}
