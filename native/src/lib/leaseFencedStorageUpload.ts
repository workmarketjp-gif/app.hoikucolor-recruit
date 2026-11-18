/**
 * An ambiguous private Storage write must not be silently replayed. A failed
 * response can mean the object was committed, a permission check was denied,
 * or the transport failed. This helper will accept a positive, current-owner
 * object-presence probe, but will NEVER infer absence from an error/404 or
 * automatically issue another write. The caller still owns the canonical
 * registration/readback and independent owner/session checks.
 */
export const STORAGE_WRITE_UNCONFIRMED =
  '書類の保存状況を確認できませんでした。書類一覧を再読み込みして確認してください。';

export async function ensureLeaseFencedStorageUpload(options: {
  upload: () => Promise<{ error: unknown | null }>;
  exists: () => Promise<boolean>;
  assertCurrent: () => void;
}): Promise<void> {
  options.assertCurrent();
  const first = await options.upload();
  options.assertCurrent();
  if (!first.error) return;

  let present: boolean;
  try {
    present = await options.exists();
  } catch {
    // Even a 404 may mean denied access, not verified nonexistence.
    options.assertCurrent();
    throw new Error(STORAGE_WRITE_UNCONFIRMED);
  }
  options.assertCurrent();
  if (present === true) return;
  // A synthetic false (or future probe returning false) is not authorization
  // for a second write. Only a fresh user operation may start a new upload.
  throw new Error(STORAGE_WRITE_UNCONFIRMED);
}
