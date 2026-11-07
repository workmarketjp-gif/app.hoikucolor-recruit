/**
 * Web-parity résumé photo export: centre-crop to 3:4, resample to 600 x 800 and
 * re-encode as JPEG at quality 0.88 (Web `prepareResumePhoto`). The native image
 * module is injected so the geometry and safety rules are testable without a device.
 *
 * Web fills a white background under the image. Native cannot flatten alpha
 * without a pixel decoder, and a JPEG export of a transparent PNG would render
 * black, so PNGs that carry an alpha channel are rejected instead of mis-rendered.
 */
import { decodeResumePhotoBase64 } from './resumePhotoSanitizer';

export const RESUME_PHOTO_EXPORT_WIDTH = 600;
export const RESUME_PHOTO_EXPORT_HEIGHT = 800;
export const RESUME_PHOTO_EXPORT_QUALITY = 0.88;

export type PhotoCrop = { originX: number; originY: number; width: number; height: number };

/** Largest centred 3:4 rectangle inside width x height, in whole pixels. */
export function centerCropTo3x4(width: number, height: number): PhotoCrop {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 4) {
    throw new Error('写真のサイズを確認できませんでした。');
  }
  const target = RESUME_PHOTO_EXPORT_WIDTH / RESUME_PHOTO_EXPORT_HEIGHT;
  const wide = width / height > target;
  const cropWidth = wide ? Math.floor((height * 3) / 4) : width;
  const cropHeight = wide ? height : Math.floor((width * 4) / 3);
  return {
    originX: Math.floor((width - cropWidth) / 2),
    originY: Math.floor((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  };
}

/** True when a PNG has an alpha channel (colour type 4/6) or a tRNS transparency chunk. */
export function pngHasAlpha(base64: string): boolean {
  const bytes = decodeResumePhotoBase64(base64);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value)) {
    throw new Error('写真を安全に読み込めませんでした。もう一度選んでください。');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'IHDR') {
      const colorType = bytes[offset + 8 + 9];
      if (colorType === 4 || colorType === 6) return true;
    }
    if (type === 'tRNS') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += 12 + length;
  }
  return false;
}

export type ManipulatedImage = { uri: string; width: number; height: number; base64?: string | null };
export type PhotoManipulator = (
  uri: string,
  actions: ({ crop: PhotoCrop } | { resize: { width: number; height: number } })[],
  options: { compress: number; base64: boolean },
) => Promise<ManipulatedImage>;

export type ExportedResumePhoto = {
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  /** Every cache file created by the export; the caller must delete all of them. */
  temporaryUris: string[];
};

/**
 * `source` is the picker asset. Pass 1 re-encodes without actions so the OS
 * applies EXIF orientation and reports the true oriented pixel size; pass 2
 * crops and resamples from that oriented copy.
 */
export async function exportResumePhoto(
  source: { uri: string; mimeType?: string | null; base64?: string | null },
  manipulate: PhotoManipulator,
): Promise<ExportedResumePhoto> {
  const mime = source.mimeType;
  if (mime !== 'image/jpeg' && mime !== 'image/png') {
    throw new Error('写真はJPEGまたはPNGの画像を選んでください。');
  }
  if (mime === 'image/png') {
    if (!source.base64 || pngHasAlpha(source.base64)) {
      throw new Error('透過のあるPNGは使えません。JPEGの写真、または背景が透過していない画像を選んでください。');
    }
  }
  const temporaryUris: string[] = [];
  const oriented = await manipulate(source.uri, [], { compress: 1, base64: false });
  temporaryUris.push(oriented.uri);
  try {
    const crop = centerCropTo3x4(oriented.width, oriented.height);
    const exported = await manipulate(
      oriented.uri,
      [{ crop }, { resize: { width: RESUME_PHOTO_EXPORT_WIDTH, height: RESUME_PHOTO_EXPORT_HEIGHT } }],
      { compress: RESUME_PHOTO_EXPORT_QUALITY, base64: true },
    );
    temporaryUris.push(exported.uri);
    if (!exported.base64 || exported.width !== RESUME_PHOTO_EXPORT_WIDTH || exported.height !== RESUME_PHOTO_EXPORT_HEIGHT) {
      throw new Error('写真を600×800に整えられませんでした。もう一度選んでください。');
    }
    return { base64: exported.base64, mimeType: 'image/jpeg', width: exported.width, height: exported.height, temporaryUris };
  } catch (cause) {
    // Surface the files so the caller can delete them even when the export fails.
    // Native modules may reject with strings, null or immutable Error objects.
    // Use a writable Error so the caller can always remove first-pass cache files.
    const failure = new Error(cause instanceof Error ? cause.message : '写真を加工できませんでした。もう一度選んでください。');
    (failure as Error & { temporaryUris?: string[] }).temporaryUris = temporaryUris;
    throw failure;
  }
}
