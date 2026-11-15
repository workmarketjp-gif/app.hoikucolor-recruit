/**
 * Fence an interview answer across asynchronous SecureStore preparation,
 * the authorized RPC and its canonical readback. A pinned client alone is not
 * evidence that the originating screen/session is still current.
 *
 * Once invoke starts, interruption can mean the server already committed:
 * leave the durable recovery receipt intact unless exact readback confirms.
 * No automatic second RPC is ever started by this helper.
 */
export async function respondCandidateInterviewWithLease<TDetail>(options: {
  isCurrent: () => boolean;
  prepare: () => Promise<void>;
  invoke: () => Promise<void>;
  readback: () => Promise<TDetail>;
  confirms: (detail: TDetail) => boolean;
  clear: () => Promise<void>;
}): Promise<TDetail> {
  const assertCurrent = () => {
    if (!options.isCurrent()) {
      throw new Error('認証または閲覧状態が変わりました。再送信せず応募管理で面接回答をご確認ください。');
    }
  };
  assertCurrent();
  await options.prepare();
  // In particular, a slow SecureStore operation must NOT launch an answer
  // after sign-out, account switch, App Lock, or route blur.
  assertCurrent();
  await options.invoke();
  assertCurrent();
  const detail = await options.readback();
  assertCurrent();
  if (!options.confirms(detail)) {
    throw new Error('面接回答の反映を確認できませんでした。再送信せず応募管理を再読み込みしてください。');
  }
  assertCurrent();
  await options.clear();
  assertCurrent();
  return detail;
}
