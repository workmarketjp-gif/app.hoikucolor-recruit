/**
 * The career-conditions RPC is a private write followed by a canonical read.
 * A failed acknowledgement or readback does not prove the mutation failed.
 * Never surface upstream error.message (may contain private RPC arguments).
 */
export type CareerMutationFailure = Readonly<{
  notice: string;
  requiresCanonicalReload: boolean;
}>;

export function careerMutationFailure(writeStarted: boolean): CareerMutationFailure {
  return writeStarted
    ? {
        notice: '保存・削除の結果を確認できませんでした。続けて操作せず、保存状況を再確認してください。',
        requiresCanonicalReload: true,
      }
    : {
        notice: 'ログイン状態または通信を確認できませんでした。保存・削除の操作は開始していません。',
        requiresCanonicalReload: false,
      };
}

export function careerReadFailure(): string {
  return '情報を取得できませんでした。通信状態を確認して再読み込みしてください。';
}
