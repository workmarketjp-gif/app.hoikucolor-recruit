/**
 * Retrying an upload after a lost response is only permitted while the pinned
 * candidate/session is still current. The caller owns object-path uniqueness,
 * post-upload canonical registration/readback and the private Storage policy.
 * This helper never registers a document or sends an application.
 */
export async function ensureLeaseFencedStorageUpload(options: {
  upload: () => Promise<{ error: unknown | null }>;
  exists: () => Promise<boolean>;
  assertCurrent: () => void;
}): Promise<void> {
  options.assertCurrent();
  const first = await options.upload();
  options.assertCurrent();
  if (!first.error) return;

  const alreadyUploaded = await options.exists();
  options.assertCurrent();
  if (alreadyUploaded) return;

  // A second upload must never start after owner/session/foreground revocation.
  const retry = await options.upload();
  options.assertCurrent();
  if (!retry.error) return;

  const nowUploaded = await options.exists();
  options.assertCurrent();
  if (nowUploaded) return;
  throw retry.error;
}
