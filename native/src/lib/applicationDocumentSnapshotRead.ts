import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * One bounded, session-fenced canonical read for the three document-vault
 * sources shown in an application. All three sources are required to present
 * a verified snapshot; a null/partial/transport failure is UNKNOWN, not [].
 * No mutation or automatic retry is performed here.
 */
export async function readApplicationDocumentSnapshot<
  TSaved extends readonly unknown[],
  TSubmitted extends readonly unknown[],
  TExpectations extends readonly unknown[],
>(options: {
  loadSaved: () => Promise<TSaved>;
  loadSubmitted: () => Promise<TSubmitted>;
  loadExpectations: () => Promise<TExpectations>;
  isCurrent: () => boolean;
  timeoutMs?: number;
}): Promise<{ saved: TSaved; submitted: TSubmitted; expectations: TExpectations }> {
  // Recheck the lease in the bounded read's deferred callback: it can be
  // revoked after React starts an operation but before any RPC is launched.
  const values = await boundedPrivateRead(async () => {
    if (!options.isCurrent()) throw new Error('閲覧状態が変わったため書類の取得を中止しました。');
    return Promise.all([
      options.loadSaved(),
      options.loadSubmitted(),
      options.loadExpectations(),
    ] as const);
  }, options.timeoutMs);

  // A successful transport response is not proof of a complete canonical
  // snapshot. Fail closed if even one of the three arrays is absent.
  if (!options.isCurrent()) throw new Error('閲覧状態が変わったため書類を表示できません。');
  const [saved, submitted, expectations] = values;
  if (!Array.isArray(saved) || !Array.isArray(submitted) || !Array.isArray(expectations)) {
    throw new Error('応募書類の一部を確認できませんでした。もう一度読み込んでください。');
  }
  return { saved, submitted, expectations };
}
