import { boundedPrivateRead } from './privateReadDeadline.ts';
import { pinCandidateForRead } from './pinnedCandidateRead.ts';

/**
 * Open one already-authorized submitted application document via an OS HTTPS
 * handler. Session/token pinning and signed-URL retrieval are separate bounded
 * PRIVATE READS, not new mutations; neither a delayed token nor a late URL may
 * launch an external viewer after timeout, logout, App Lock or route blur.
 * Authorization and private Storage remain enforced by existing server APIs.
 */
export async function openCandidateApplicationDocument<TClient>(options: {
  pin: () => Promise<Readonly<{ client: TClient; isCurrent: () => boolean }> | null>;
  getSignedUrl: (client: TClient) => Promise<string>;
  openUrl: (url: string) => Promise<unknown>;
  isCurrent: () => boolean;
  timeoutMs?: number;
}): Promise<void> {
  const pinned = await pinCandidateForRead(options.pin, options.isCurrent, options.timeoutMs);
  const requireCurrent = () => {
    if (!options.isCurrent() || !pinned.isCurrent()) {
      throw new Error('安全な閲覧状態を確認できませんでした。書類を開き直してください。');
    }
  };
  requireCurrent();
  const signedUrl = await boundedPrivateRead(() => {
    requireCurrent();
    return options.getSignedUrl(pinned.client);
  }, options.timeoutMs);
  requireCurrent();
  // Defense in depth: never dispatch an untrusted URL to the OS. The existing
  // documentVaultApi also checks HTTPS before returning a signed Storage URL.
  let verifiedUrl: URL;
  try {
    verifiedUrl = new URL(signedUrl);
  } catch {
    throw new Error('提出済み書類の安全なURLを確認できませんでした。');
  }
  if (verifiedUrl.protocol !== 'https:' || verifiedUrl.username || verifiedUrl.password) {
    throw new Error('提出済み書類の安全なURLを確認できませんでした。');
  }
  requireCurrent();
  await options.openUrl(signedUrl);
}
