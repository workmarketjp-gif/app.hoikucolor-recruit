/**
 * A failed candidate-private message-index read must not render backend/Clerk
 * exception text. Those errors can include identifiers, RPC internals or
 * other account-scoped details. Authorization and retry remain unchanged.
 * An error is never treated as a successfully verified empty inbox.
 */
export function presentMessageInboxReadFailure(_cause: unknown): string {
  return '応募先とのやりとりを取得できませんでした。通信状態を確認して再読み込みしてください。';
}
