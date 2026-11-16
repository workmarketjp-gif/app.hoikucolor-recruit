/**
 * Candidate-private document RPC, storage and OS file-handler errors can
 * contain Clerk identifiers, attachment paths or time-limited signed URLs.
 * Never render the raw error in the application document panel. Authorization
 * remains server-side and a failed read is never treated as an empty vault.
 */
export function presentApplicationDocumentError(
  operation: 'refresh' | 'open',
  _cause: unknown,
): string {
  return operation === 'open'
    ? '提出済み書類を開けませんでした。通信状態を確認し、もう一度お試しください。'
    : '応募書類を読み込めませんでした。通信状態を確認し、もう一度お試しください。';
}
