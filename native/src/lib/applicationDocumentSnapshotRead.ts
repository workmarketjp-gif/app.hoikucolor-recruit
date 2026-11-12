import { boundedPrivateRead } from './privateReadDeadline.ts';

/**
 * One bounded, session-fenced canonical read for the three document-vault
 * sources shown in an application. All three sources are required to present
 * a verified snapshot; a null/partial/transport failure is UNKNOWN, not [].
 * Every returned private row must also belong to the pinned Clerk candidate
 * or the requested application. Server RLS is the authority; these checks
 * fail closed on an unexpected/malformed response, not a replacement for RLS.
 * No mutation or automatic retry is performed here.
 */
export async function readApplicationDocumentSnapshot<
  TSaved extends readonly { jobseeker_clerk_user_id: string }[],
  TSubmitted extends readonly { application_id: string }[],
  TExpectations extends readonly { application_id: string }[],
>(options: {
  ownerId: string;
  applicationId: string;
  loadSaved: () => Promise<TSaved>;
  loadSubmitted: () => Promise<TSubmitted>;
  loadExpectations: () => Promise<TExpectations>;
  isCurrent: () => boolean;
  timeoutMs?: number;
}): Promise<{ saved: TSaved; submitted: TSubmitted; expectations: TExpectations }> {
  if (typeof options.ownerId !== 'string' || !options.ownerId.trim() ||
      typeof options.applicationId !== 'string' || !options.applicationId.trim()) {
    throw new Error('応募書類の所有者または応募先を確認できませんでした。');
  }
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

  if (!options.isCurrent()) throw new Error('閲覧状態が変わったため書類を表示できません。');
  const [saved, submitted, expectations] = values;
  if (!Array.isArray(saved) || !Array.isArray(submitted) || !Array.isArray(expectations)) {
    throw new Error('応募書類の一部を確認できませんでした。もう一度読み込んでください。');
  }
  // A 200 response plus an array is not itself evidence of ownership. Do
  // not render, attach or download a wrong-candidate/wrong-application row.
  const validSaved = saved.every((row) => row !== null && typeof row === 'object' &&
    row.jobseeker_clerk_user_id === options.ownerId);
  const validSubmitted = submitted.every((row) => row !== null && typeof row === 'object' &&
    row.application_id === options.applicationId);
  const validExpectations = expectations.every((row) => row !== null && typeof row === 'object' &&
    row.application_id === options.applicationId);
  if (!validSaved || !validSubmitted || !validExpectations) {
    throw new Error('応募書類の所有者または応募先を確認できませんでした。');
  }
  return { saved, submitted, expectations };
}
