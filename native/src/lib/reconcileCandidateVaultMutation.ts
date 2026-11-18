import {
  assertCandidateDocumentListOwner,
  type CandidateDocumentRow,
} from './documentVaultPrivacy.ts';

type VaultMutation = 'made-default' | 'deleted';

/**
 * A private-vault RPC/Storage mutation may commit before its response is lost.
 * Send a destructive or default-changing request at most once, then inspect one
 * canonical, candidate-scoped readback. Never turn a failed read into "empty".
 * All guards are presentation/continuation fences; server RLS is authoritative.
 */
export async function reconcileCandidateVaultMutation<TDocument extends CandidateDocumentRow>(options: {
  target: TDocument;
  ownerId: string;
  action: VaultMutation;
  isCurrent: () => boolean;
  mutate: () => Promise<unknown>;
  readback: () => Promise<TDocument[]>;
}): Promise<TDocument[]> {
  const denied = () => new Error('書類の操作権限を確認できませんでした。再読み込みしてください。');
  const uncertain = () => new Error('書類の更新結果を確認できませんでした。再読み込みして状態を確認してください。');
  const { target, ownerId, action, isCurrent } = options;
  if (!ownerId || target.jobseeker_clerk_user_id !== ownerId || !isCurrent()) throw denied();

  // The mutation must not be replayed even if the response is ambiguous.
  let mutationSucceeded = false;
  try {
    await options.mutate();
    mutationSucceeded = true;
  } catch {
    // A committed write can outlive a dropped RPC response; read back once.
  }
  if (!isCurrent()) throw denied();

  let rows: TDocument[];
  try {
    rows = await options.readback();
    if (!isCurrent()) throw denied();
    assertCandidateDocumentListOwner(rows, ownerId);
  } catch {
    throw uncertain();
  }

  // Do not accept an ambiguous readback: the chosen record must be unique,
  // and at most one default of the same type may exist. Another type can keep
  // its own default. RPC completion alone never certifies the displayed state.
  const identities = new Set(rows.map((row) => row.id));
  if (identities.size !== rows.length) throw uncertain();
  const current = rows.find((row) => row.id === target.id);
  const sameTypeDefaults = rows.filter((row) =>
    row.document_type === target.document_type && row.is_default === true);
  const matches = action === 'deleted'
    // An empty RLS-filtered list cannot prove deletion after an ambiguous RPC.
    ? mutationSucceeded && current === undefined
    : current?.jobseeker_clerk_user_id === ownerId &&
      current.file_path === target.file_path &&
      current.document_type === target.document_type &&
      current.is_default === true &&
      sameTypeDefaults.length === 1 && sameTypeDefaults[0].id === target.id;
  if (!matches || !isCurrent()) throw uncertain();
  return rows;
}
