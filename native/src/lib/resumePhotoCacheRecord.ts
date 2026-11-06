/** App-private, best-effort résumé-photo cache envelope (never a server document).
 * Untrusted disk bytes MUST be passed through prepareResumePhotoPreview before UI.
 */
type PhotoPreviewRecord = { dataUri: string; mimeType: 'image/jpeg' | 'image/png'; width: number; height: number; byteLength: number };
type PickedPhotoRecord = { base64: string; mimeType: 'image/jpeg' | 'image/png'; width: number; height: number };

const MAX_RECORD_CHARS = 14 * 1024 * 1024 + 1024;
const PHOTO_URI = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

export function encodeResumePhotoCacheRecord(photo: PhotoPreviewRecord): string {
  const matched = PHOTO_URI.exec(photo.dataUri);
  if (!matched || matched[1] !== photo.mimeType ||
      !Number.isSafeInteger(photo.width) || photo.width <= 0 ||
      !Number.isSafeInteger(photo.height) || photo.height <= 0 ||
      !Number.isSafeInteger(photo.byteLength) || photo.byteLength <= 0 ||
      photo.byteLength > 10 * 1024 * 1024) {
    throw new Error('証明写真を端末に保存できませんでした。もう一度選んでください。');
  }
  const base64 = matched[2];
  const decodedLength = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (base64.length % 4 !== 0 || decodedLength !== photo.byteLength) {
    throw new Error('証明写真のデータを確認できませんでした。');
  }
  const record = JSON.stringify({ version: 1, mimeType: photo.mimeType, width: photo.width,
    height: photo.height, byteLength: photo.byteLength, base64 });
  if (record.length > MAX_RECORD_CHARS) throw new Error('証明写真は10MB以下にしてください。');
  return record;
}

/** Decode shape only. The caller must re-sanitize actual image bytes before display. */
export function decodeResumePhotoCacheRecord(raw: string): PickedPhotoRecord & { byteLength: number } {
  if (!raw || raw.length > MAX_RECORD_CHARS) throw new Error('保存された証明写真を確認できませんでした。');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('保存された証明写真を確認できませんでした。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('保存された証明写真を確認できませんでした。');
  const value = parsed as Record<string, unknown>;
  if (value.version !== 1 || (value.mimeType !== 'image/jpeg' && value.mimeType !== 'image/png') ||
      typeof value.base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.base64) ||
      value.base64.length % 4 !== 0 ||
      !Number.isSafeInteger(value.width) || (value.width as number) <= 0 ||
      !Number.isSafeInteger(value.height) || (value.height as number) <= 0 ||
      !Number.isSafeInteger(value.byteLength) || (value.byteLength as number) <= 0 ||
      (value.byteLength as number) > 10 * 1024 * 1024) {
    throw new Error('保存された証明写真を確認できませんでした。');
  }
  const bytes = value.base64.length / 4 * 3 - (value.base64.endsWith('==') ? 2 : value.base64.endsWith('=') ? 1 : 0);
  if (bytes !== value.byteLength) throw new Error('保存された証明写真を確認できませんでした。');
  return { base64: value.base64, mimeType: value.mimeType as 'image/jpeg' | 'image/png',
    width: value.width as number, height: value.height as number, byteLength: value.byteLength as number };
}
