import { ActivityIndicator, Button, Text, View } from 'react-native';
import type { PropsWithChildren } from 'react';
import type { AccountDeletionRequest } from '../lib/accountDeletionApi';
import { getAccountDeletionUiPolicy } from '../lib/accountDeletionPolicy';

type Props = PropsWithChildren<{
  request: AccountDeletionRequest | null;
  loading: boolean;
  busy: boolean;
  lastError: string | null;
  localPurgeError?: string | null;
  onRefresh: () => void | Promise<unknown>;
  onCancel: () => void | Promise<unknown>;
  onSignOut: () => void | Promise<unknown>;
}>;

function run(action: () => void | Promise<unknown>) {
  void Promise.resolve(action()).catch(() => undefined);
}

function ErrorState({ lastError, localPurgeError }: { lastError: string | null; localPurgeError?: string | null }) {
  return (
    <>
      {lastError ? <Text style={{ color: '#b42318' }}>状態の確認に失敗しました。もう一度お試しください。</Text> : null}
      {localPurgeError ? <Text style={{ color: '#b42318' }}>端末内の応募・通知情報を安全に整理できませんでした。再試行してください。</Text> : null}
    </>
  );
}

const shell = { flex: 1, padding: 28, justifyContent: 'center' as const, gap: 14 };

export function AccountDeletionGate({
  children,
  request,
  loading,
  busy,
  lastError,
  localPurgeError,
  onRefresh,
  onCancel,
  onSignOut,
}: Props) {
  const status = request?.status ?? null;
  const policy = getAccountDeletionUiPolicy(status);

  if (loading && !request) {
    return <View testID="account-deletion-bootstrap" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator /></View>;
  }

  // Unknown deletion state is a security boundary, not a normal network error.
  // Do not reveal Candidate business UI until the canonical RPC has confirmed
  // that this exact session has no active deletion hold.
  if (!loading && !request && lastError) {
    return (
      <View testID="account-deletion-status-blocked" style={shell}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>アカウント状態を確認できません</Text>
        <Text>安全のため、応募・メッセージ・保存・書類などの個人情報を表示していません。</Text>
        <ErrorState lastError={lastError} localPurgeError={localPurgeError} />
        <Button title="状態を再確認" disabled={busy} onPress={() => run(onRefresh)} />
        <Button title="ログアウト" disabled={busy} onPress={() => run(onSignOut)} />
      </View>
    );
  }

  if (!policy.blocksBusinessUi) return <>{children}</>;

  if (status === 'requested') {
    return (
      <View testID="account-deletion-requested" style={shell}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>アカウント削除を受け付けました</Text>
        <Text>削除処理が始まるまで通常利用を停止しています。処理開始前であれば、この画面から削除リクエストを取り消せます。</Text>
        <Text>応募・メッセージ・保存・書類更新・Push再登録は行いません。</Text>
        <ErrorState lastError={lastError} localPurgeError={localPurgeError} />
        <Button title={busy ? '処理中…' : '削除を取り消す'} disabled={busy} onPress={() => run(onCancel)} />
        <Button title="状態を再確認" disabled={busy} onPress={() => run(onRefresh)} />
      </View>
    );
  }

  if (status === 'processing') {
    return (
      <View testID="account-deletion-processing" style={shell}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>アカウント削除を処理しています</Text>
        <Text>新しい応募・メッセージ・保存・書類更新はできません。Hoiku Colorの求職者データを削除または必要範囲で匿名化しています。</Text>
        <ErrorState lastError={lastError} localPurgeError={localPurgeError} />
        <Button title="状態を再確認" onPress={() => run(onRefresh)} />
        <Button title="ログアウト" onPress={() => run(onSignOut)} />
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View testID="account-deletion-failed" style={shell}>
        <Text style={{ fontSize: 24, fontWeight: '700' }}>削除処理の確認が必要です</Text>
        <Text>データの一部がすでに削除されている可能性があるため、通常利用には戻しません。処理状況を再確認してください。</Text>
        <ErrorState lastError={lastError} localPurgeError={localPurgeError} />
        <Button title="状態を再確認" onPress={() => run(onRefresh)} />
        <Button title="ログアウト" onPress={() => run(onSignOut)} />
      </View>
    );
  }

  return (
    <View testID="account-deletion-completed" style={shell}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Hoiku Colorアカウントの削除が完了しました</Text>
      <Text>この端末のHoiku Colorセッションを終了します。</Text>
      <ErrorState lastError={lastError} localPurgeError={localPurgeError} />
      <Button title="ログアウト" onPress={() => run(onSignOut)} />
    </View>
  );
}
