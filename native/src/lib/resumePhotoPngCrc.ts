/**
 * PNG chunks carry a mandatory CRC-32 over their four-byte type and payload.
 * Reject corruption before forwarding image bytes to a native decoder or a PDF.
 * The caller already enforces the encoded 10 MB photo cap; this function also
 * validates the chunk boundary to avoid reading outside a tampered file.
 */
export function pngChunkCrcValid(bytes: Uint8Array, offset: number, payloadLength: number): boolean {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(payloadLength) ||
      offset < 0 || payloadLength < 0 || offset > bytes.length - 12 ||
      payloadLength > bytes.length - offset - 12) return false;

  let checksum = 0xffffffff;
  const end = offset + 8 + payloadLength;
  for (let index = offset + 4; index < end; index++) {
    checksum ^= bytes[index];
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
    }
  }
  const provided = (bytes[end] * 0x1000000 + (bytes[end + 1] << 16) +
    (bytes[end + 2] << 8) + bytes[end + 3]) >>> 0;
  return ((checksum ^ 0xffffffff) >>> 0) === provided;
}
