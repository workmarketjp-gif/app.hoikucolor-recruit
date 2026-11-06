/**
 * An optional résumé photo remains on the candidate's device and in memory;
 * it is never uploaded on its own or represented as a created PDF.
 * Expo's OS cache is handled by the UI. Sanitization strips JPEG/PNG container
 * metadata before the in-memory preview is constructed; crop/resampling are
 * still NOT equivalent to Web's 600 x 800 JPEG export.
 */
import { decodeResumePhotoBase64, sanitizeResumePhoto } from './resumePhotoSanitizer';
import { inspectResumePhotoDimensions } from './resumePhotoDimensions';

export const RESUME_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

export type PickedResumePhoto = {
  base64?: string | null;
  mimeType?: string | null;
  width: number;
  height: number;
};

export type ResumePhotoPreview = {
  dataUri: string;
  mimeType: 'image/jpeg' | 'image/png';
  byteLength: number;
  width: number;
  height: number;
};

export function prepareResumePhotoPreview(asset: PickedResumePhoto): ResumePhotoPreview {
  const mime = asset.mimeType;
  if (mime !== 'image/jpeg' && mime !== 'image/png') {
    throw new Error('写真はJPEGまたはPNGの画像を選んでください。');
  }
  if (!Number.isSafeInteger(asset.width) || !Number.isSafeInteger(asset.height) ||
      asset.width <= 0 || asset.height <= 0) {
    throw new Error('写真の画像サイズを確認できませんでした。');
  }
  const encoded = asset.base64;
  if (!encoded || encoded.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('写真を安全に読み込めませんでした。もう一度選んでください。');
  }
  const byteLength = encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (!byteLength || byteLength > RESUME_PHOTO_MAX_BYTES) {
    throw new Error('写真は10MB以下の画像を選んでください。');
  }
  // Content signature wins over the picker-supplied MIME. No unparsed original
  // bytes survive in the data URI even if the editor returned GPS or XMP tags.
  if ((mime === 'image/jpeg' && !encoded.startsWith('/9j/')) ||
      (mime === 'image/png' && !encoded.startsWith('iVBORw0KGgo'))) {
    throw new Error('写真の内容と画像形式が一致しません。');
  }
  const clean = sanitizeResumePhoto(encoded, mime);
  // The actual file header is the dimension authority; Expo picker-reported
  // dimensions can differ after OS cropping/orientation and are not a
  // trustworthy basis for generated document layout or cached records.
  const dimensions = inspectResumePhotoDimensions(decodeResumePhotoBase64(clean.base64), mime);
  return { dataUri: `data:${mime};base64,${clean.base64}`, mimeType: mime,
    byteLength: clean.byteLength, width: dimensions.width, height: dimensions.height };
}

/** An OS picker can return after account switch, screen blur or App Lock. */
export function canPresentResumePhoto(input: {
  startedOwner: string | null;
  currentOwner: string | null;
  loadedOwner: string | null;
  startedGeneration: number;
  currentGeneration: number;
  privateAllowed: boolean;
  screenActive: boolean;
}): boolean {
  return Boolean(input.startedOwner && input.startedOwner === input.currentOwner &&
    input.startedOwner === input.loadedOwner && input.privateAllowed &&
    input.screenActive && input.startedGeneration === input.currentGeneration);
}
