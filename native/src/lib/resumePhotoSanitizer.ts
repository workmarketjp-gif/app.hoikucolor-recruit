/**
 * Removes container metadata from a résumé photo picked on the candidate's own
 * device. No upload, resizing or PDF creation happens here. This is a second
 * privacy boundary after Expo ImagePicker's exif:false request: an OS editor is
 * not itself evidence that GPS/EXIF has been stripped on either platform.
 *
 * Parsed JPEG scan data and PNG essential image chunks are preserved intact.
 * Reject unknown/truncated structures rather than accidentally forward metadata.
 */
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type SanitizedResumePhoto = { base64: string; byteLength: number };

export function decodeResumePhotoBase64(value: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('写真を安全に読み込めませんでした。もう一度選んでください。');
  }
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const length = value.length / 4 * 3 - padding;
  if (!length || length > MAX_IMAGE_BYTES) throw new Error('写真は10MB以下の画像を選んでください。');
  const result = new Uint8Array(length);
  let written = 0;
  for (let i = 0; i < value.length; i += 4) {
    const a = BASE64.indexOf(value[i]);
    const b = BASE64.indexOf(value[i + 1]);
    const c = value[i + 2] === '=' ? 0 : BASE64.indexOf(value[i + 2]);
    const d = value[i + 3] === '=' ? 0 : BASE64.indexOf(value[i + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0 || (value[i + 2] === '=' && value[i + 3] !== '=') ||
        (padding === 1 && i === value.length - 4 && (c & 3) !== 0) ||
        (padding === 2 && i === value.length - 4 && (b & 15) !== 0)) {
      throw new Error('写真を安全に読み込めませんでした。もう一度選んでください。');
    }
    const combined = (a << 18) | (b << 12) | (c << 6) | d;
    if (written < length) result[written++] = (combined >>> 16) & 255;
    if (written < length) result[written++] = (combined >>> 8) & 255;
    if (written < length) result[written++] = combined & 255;
  }
  return result;
}

function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  // Small chunks avoid a multi-megabyte intermediate JS array/string spread.
  for (let start = 0; start < bytes.length; start += 12288) {
    let text = '';
    for (let i = start; i < Math.min(start + 12288, bytes.length); i += 3) {
      const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      text += BASE64[a >>> 2] + BASE64[((a & 3) << 4) | (b >>> 4)] +
        (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >>> 6)] : '=') +
        (i + 2 < bytes.length ? BASE64[c & 63] : '=');
    }
    parts.push(text);
  }
  return parts.join('');
}

const corrupt = () => new Error('写真の形式を確認できませんでした。別のJPEG・PNGを選んでください。');
function joinPieces(chunks: Uint8Array[]): Uint8Array {
  const count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!count || count > MAX_IMAGE_BYTES) throw corrupt();
  const result = new Uint8Array(count);
  let cursor = 0;
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}

function sanitizeJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8 || bytes[0] !== 255 || bytes[1] !== 216) throw corrupt();
  const chunks: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  let seenScan = false;
  while (at + 2 <= bytes.length) {
    if (bytes[at] !== 255) throw corrupt();
    const start = at;
    while (at < bytes.length && bytes[at] === 255) at++;
    const marker = bytes[at++];
    if (marker === undefined || marker === 0 || marker === 216) throw corrupt();
    if (marker === 217) { // EOI: exclude any appended untrusted trailer.
      if (!seenScan) throw corrupt();
      chunks.push(bytes.subarray(start, at));
      return joinPieces(chunks);
    }
    if (marker === 1 || (marker >= 208 && marker <= 215)) throw corrupt();
    if (at + 2 > bytes.length) throw corrupt();
    const length = (bytes[at] << 8) | bytes[at + 1];
    if (length < 2 || at + length > bytes.length) throw corrupt();
    const end = at + length;
    if (marker === 218) { // SOS. Walk entropy-coded scan, honoring escaped FF and restarts.
      seenScan = true;
      let next = end;
      while (next + 1 < bytes.length) {
        if (bytes[next] !== 255) { next++; continue; }
        let i = next + 1;
        while (i < bytes.length && bytes[i] === 255) i++;
        const code = bytes[i];
        if (code === 0 || code === 1 || (code >= 208 && code <= 215)) { next = i + 1; continue; }
        break; // Another marker (e.g. next progressive SOS or EXIF between scans).
      }
      if (next + 1 >= bytes.length) throw corrupt();
      chunks.push(bytes.subarray(start, next));
      at = next;
      continue;
    }
    // APP0..APP15 include EXIF/XMP/ICC/Photoshop metadata; COM may contain
    // name, date or GPS. Skip them even between progressive JPEG scans.
    if (!((marker >= 224 && marker <= 239) || marker === 254)) {
      chunks.push(bytes.subarray(start, end));
    }
    at = end;
  }
  throw corrupt(); // No EOI. Never expose a partially parsed image.
}

function pngLength(bytes: Uint8Array, at: number): number {
  return (bytes[at] * 0x1000000) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
}
const PNG_ESSENTIAL = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);
function sanitizePng(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 20 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) throw corrupt();
  const chunks = [bytes.subarray(0, 8)];
  let at = 8, seenHeader = false, seenImage = false, finished = false;
  while (at + 12 <= bytes.length) {
    const length = pngLength(bytes, at);
    if (!Number.isSafeInteger(length) || length > bytes.length - at - 12) throw corrupt();
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!/^[A-Za-z]{4}$/.test(type)) throw corrupt();
    const end = at + 12 + length;
    if (!seenHeader && (type !== 'IHDR' || length !== 13)) throw corrupt();
    if (type === 'IHDR') { if (seenHeader || length !== 13) throw corrupt(); seenHeader = true; }
    if (type === 'IDAT') seenImage = true;
    if (type === 'IEND') { if (!seenImage || length !== 0) throw corrupt(); finished = true; }
    // Unknown critical chunks cannot be silently omitted without changing the
    // image decoder's semantics; known ancillary metadata is intentionally dropped.
    if (type[0] === type[0].toUpperCase() && !PNG_ESSENTIAL.has(type)) throw corrupt();
    if (PNG_ESSENTIAL.has(type)) chunks.push(bytes.subarray(at, end));
    at = end;
    if (finished) break;
  }
  if (!seenHeader || !seenImage || !finished) throw corrupt();
  // Strip trailing bytes after IEND (including possible appended private data).
  return joinPieces(chunks);
}

export function sanitizeResumePhoto(base64: string, mimeType: 'image/jpeg' | 'image/png'): SanitizedResumePhoto {
  const bytes = decodeResumePhotoBase64(base64);
  const sanitized = mimeType === 'image/jpeg' ? sanitizeJpeg(bytes) : sanitizePng(bytes);
  return { base64: encodeBase64(sanitized), byteLength: sanitized.byteLength };
}
