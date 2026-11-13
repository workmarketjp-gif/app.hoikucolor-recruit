/**
 * Candidate-only durable message send. The RPC client must already be pinned to
 * the launching Clerk user/session; this additionally prevents starting a write
 * after a SecureStore await, App Lock, logout or a focus/route generation change.
 *
 * After invoke starts the outcome can be ambiguous: never automatically retry,
 * claim success, or clear the durable recovery receipt on stale ownership.
 * Server RPC/RLS remain the authorization boundary.
 */
export async function sendCandidateMessageWithSessionLease<Prepared, Receipt, Rows, Confirmed>(params: {
  isCurrent: () => boolean;
  prepare: () => Promise<Prepared>;
  invoke: (prepared: Prepared) => Promise<Receipt>;
  /** Signals that the final session fence passed and RPC invocation is about to start. */
  onInvokeStarted?: () => void;
  read: () => Promise<Rows>;
  confirm: (rows: Rows, receipt: Receipt) => Confirmed | null;
  clear: () => Promise<void>;
}): Promise<Confirmed> {
  const assertCurrent = () => {
    if (!params.isCurrent()) {
      throw new Error('認証状態が変わりました。再送信せず最新のメッセージをご確認ください。');
    }
  };

  assertCurrent();
  const prepared = await params.prepare();
  // Crucial: SecureStore may complete after sign-out, App Lock or navigation.
  assertCurrent();
  // A failed SecureStore preparation is NOT an uncertain server write. The
  // caller only quarantines the composer once this boundary is crossed.
  params.onInvokeStarted?.();
  const receipt = await params.invoke(prepared);
  assertCurrent();
  const rows = await params.read();
  assertCurrent();
  const confirmed = params.confirm(rows, receipt);
  if (confirmed === null) {
    throw new Error('メッセージ送信結果を確認できませんでした。再読み込みして確認してください。');
  }
  assertCurrent();
  await params.clear();
  assertCurrent();
  return confirmed;
}
