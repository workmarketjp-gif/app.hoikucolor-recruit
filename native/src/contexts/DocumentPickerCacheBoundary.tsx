import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { purgePendingDocumentPickerCache } from '../lib/documentPickerCache';
import { reconcilePendingCameraCaptureResult } from '../lib/cameraCaptureRecovery';

/**
 * Before any navigation/session UI mounts, reconcile a DocumentPicker/camera cache copy
 * that may have survived process death. Resumes and licence scans are candidate PII,
 * so a cleanup failure is fail-closed instead of silently mounting the app.
 */
export function DocumentPickerCacheBoundary({ children }: PropsWithChildren) {
  const [checking, setChecking] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const reconcile = useCallback(async () => {
    setChecking(true);
    setLastError(null);
    try {
      await reconcilePendingCameraCaptureResult();
      await purgePendingDocumentPickerCache();
    } catch (error) {
      setLastError(String((error as { message?: unknown } | null)?.message ?? error));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void reconcile();
  }, [reconcile]);

  if (checking) {
    return (
      <View testID="document-picker-cache-checking" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
        <ActivityIndicator />
        <Text>応募書類の一時データを安全に確認しています…</Text>
      </View>
    );
  }

  if (lastError) {
    return (
      <View testID="document-picker-cache-blocked" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', textAlign: 'center' }}>一時データを整理できませんでした</Text>
        <Text style={{ textAlign: 'center' }}>履歴書・資格証などの一時ファイルを安全に削除してからアプリを開きます。</Text>
        <Text style={{ color: '#b42318', textAlign: 'center' }}>{lastError}</Text>
        <Button testID="document-picker-cache-retry" title="もう一度確認" onPress={() => void reconcile()} />
      </View>
    );
  }

  return <>{children}</>;
}
