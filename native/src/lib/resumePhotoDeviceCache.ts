/**
 * Best-effort device-private photo cache. Only the already sanitized preview is
 * written; never the original picker file, a server document, or an application.
 * Expo cache can be evicted by the OS. No assertion of Web IndexedDB durability.
 * All writes use the existing Clerk owner/session lease and sign-out purge queue.
 */
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { type CandidateLocalStateSessionLease, withCandidateLocalStateWrite } from './candidateLocalStateSession';
import { decodeResumePhotoCacheRecord, encodeResumePhotoCacheRecord } from './resumePhotoCacheRecord';
import { prepareResumePhotoPreview, type ResumePhotoPreview } from './resumePhotoPreview';

const PREFIX = 'hc_color_resume_photo_v1_';

async function privatePhotoFile(userId: string): Promise<File> {
  const normalized = userId.trim();
  if (!normalized) throw new Error('AUTH_REQUIRED');
  // No plain candidate identifier in the filename. File lives in app-private
  // cache, not Photos or shared storage; do not attach it to cloud uploads.
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized);
  return new File(Paths.cache, `${PREFIX}${digest}.json`);
}

export async function loadCachedResumePhoto(userId: string): Promise<ResumePhotoPreview | null> {
  const file = await privatePhotoFile(userId);
  if (!file.exists) return null;
  const record = decodeResumePhotoCacheRecord(await file.text());
  // Re-parse and remove untrusted metadata even if a file was modified on disk.
  const prepared = prepareResumePhotoPreview(record);
  if (prepared.byteLength !== record.byteLength) {
    throw new Error('保存された証明写真を確認できませんでした。もう一度選んでください。');
  }
  return prepared;
}

export async function saveCachedResumePhoto(
  userId: string,
  photo: ResumePhotoPreview,
  lease: CandidateLocalStateSessionLease,
): Promise<void> {
  if (lease.userId !== userId) throw new Error('CANDIDATE_LOCAL_STATE_OWNER_MISMATCH');
  const data = encodeResumePhotoCacheRecord(photo);
  await withCandidateLocalStateWrite(lease, async () => {
    const file = await privatePhotoFile(userId);
    if (!file.exists) file.create();
    file.write(data);
    if (await file.text() !== data) {
      throw new Error('証明写真の端末保存を確認できませんでした。');
    }
  });
}

async function physicallyRemovePhoto(userId: string): Promise<void> {
  const file = await privatePhotoFile(userId);
  if (file.exists) file.delete();
  if (file.exists) throw new Error('端末内の証明写真を削除できませんでした。');
}

export async function removeCachedResumePhoto(
  userId: string,
  lease: CandidateLocalStateSessionLease,
): Promise<void> {
  if (lease.userId !== userId) throw new Error('CANDIDATE_LOCAL_STATE_OWNER_MISMATCH');
  await withCandidateLocalStateWrite(lease, () => physicallyRemovePhoto(userId));
}

/** Only call while withCandidateLocalStatePurge holds this owner's queue. */
export async function purgeCachedResumePhoto(userId: string): Promise<void> {
  await physicallyRemovePhoto(userId);
}
