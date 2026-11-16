/**
 * Job-detail errors cross from private, candidate-pinned RPC/Storage transports
 * into a user-visible error banner. Transport Error.message may contain
 * candidate IDs, internal routes or storage object paths. Never display it.
 *
 * A pre-submit failure here is only reached when no application RPC was
 * dispatched. Ambiguous/post-dispatch errors remain on the separate,
 * quarantine-first recovery path in job/[id].tsx.
 */
export function safeJobDetailErrorMessage(
  stage: 'load' | 'pre_submit',
  _untrustedCause: unknown,
): string {
  if (stage === 'load') {
    return '求人情報を取得できませんでした。通信状況を確認して再読み込みしてください。';
  }
  return '応募前の情報を確認できませんでした。応募は送信していません。再読み込みしてからお試しください。';
}
