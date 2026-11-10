/**
 * Candidate-only visit-request orchestration. The caller provides the already
 * pinned candidate client and canonical RPC/readback functions. This helper
 * adds no authorization: the backend still enforces candidate ownership.
 *
 * An RPC outcome can be ambiguous once invoked. A session loss, mismatched
 * readback, or network failure must not clear the durable request receipt or
 * trigger a second visit request automatically.
 */
export async function requestCandidateVisitWithLease<Prepared, Receipt, History>(params: {
  isCurrent: () => boolean;
  prepare: () => Promise<Prepared>;
  invoke: (prepared: Prepared) => Promise<Receipt>;
  readVisits: () => Promise<History>;
  confirms: (history: History, receipt: Receipt) => boolean;
  clear: () => Promise<void>;
}): Promise<Receipt> {
  const assertCurrent = () => {
    if (!params.isCurrent()) {
      throw new Error('認証状態が変更されました。再送信せず予約履歴をご確認ください。');
    }
  };

  assertCurrent();
  const prepared = await params.prepare();
  // Crucial: a session revoked while preparing a SecureStore receipt must not
  // reach the canonical hc_request_visit_v2 write.
  assertCurrent();
  const receipt = await params.invoke(prepared);
  assertCurrent();
  const history = await params.readVisits();
  assertCurrent();
  if (!params.confirms(history, receipt)) {
    throw new Error('予約結果の求人・日時・申込内容を確認できませんでした。再送信せず予約履歴を再読み込みしてください。');
  }
  assertCurrent();
  // Only exact canonical readback under the same current session may clear an
  // ambiguous-write recovery key. A failed clear must not claim completion.
  await params.clear();
  assertCurrent();
  return receipt;
}
