/**
 * Read pixel dimensions from the sanitised image bytes, not from OS picker
 * metadata. Native image pickers may return inconsistent dimensions after
 * editing, and a forged cache record must not be accepted on that basis.
 * No resizing or cropping is performed by this parser.
 */
export type ResumePhotoDimensions = { width: number; height: number };

const unsupported = () => new Error('証明写真の画像サイズを確認できませんでした。別の画像を選んでください。');

export function inspectResumePhotoDimensions(
  bytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png',
): ResumePhotoDimensions {
  if (mimeType === 'image/png') {
    // PNG signature + IHDR length(13) + type + width/height. Other image chunks
    // are fully parsed by the metadata sanitizer before this function is called.
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value) ||
        bytes[8] !== 0 || bytes[9] !== 0 || bytes[10] !== 0 || bytes[11] !== 13 ||
        bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
      throw unsupported();
    }
    const width = bytes[16] * 0x1000000 + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
    const height = bytes[20] * 0x1000000 + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
    if (width < 1 || height < 1) throw unsupported();
    return { width, height };
  }
  if (mimeType !== 'image/jpeg' || bytes.length < 8 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw unsupported();
  }
  // SOF markers (excluding DHT=C4, JPG=C8 and DAC=CC) encode real dimensions.
  // APP, DQT, DHT and comments can precede SOF. Never trust the picker width.
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at++] !== 0xff) throw unsupported();
    while (at < bytes.length && bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === undefined || marker === 0 || marker === 0xd8 || marker === 0xd9 || marker === 0xda) {
      throw unsupported();
    }
    if (at + 2 > bytes.length) throw unsupported();
    const segmentLength = (bytes[at] << 8) | bytes[at + 1];
    if (segmentLength < 2 || at + segmentLength > bytes.length) throw unsupported();
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      if (segmentLength < 11 || segmentLength !== 8 + 3 * bytes[at + 7]) throw unsupported();
      const height = (bytes[at + 3] << 8) | bytes[at + 4];
      const width = (bytes[at + 5] << 8) | bytes[at + 6];
      if (width < 1 || height < 1) throw unsupported();
      return { width, height };
    }
    at += segmentLength;
  }
  throw unsupported();
}
