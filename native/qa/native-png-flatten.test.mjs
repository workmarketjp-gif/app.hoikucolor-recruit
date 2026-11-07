// Behavioural suite: transparent PNG -> white (Web canvas parity). The test builds PNGs with Node's own zlib
// encoder (independent of fflate) and decodes the flattened result with Node zlib, so the pixel math is checked on
// the real output bytes, not on the implementation's own reading of them.
import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/') ? `${specifier}.ts` : specifier, context);
} });
const { flattenPngOnWhite } = await import('../src/lib/pngFlattenOnWhite.ts');
const { sanitizeResumePhoto, decodeResumePhotoBase64 } = await import('../src/lib/resumePhotoSanitizer.ts');
const { inspectResumePhotoDimensions } = await import('../src/lib/resumePhotoDimensions.ts');
const { pngHasAlpha } = await import('../src/lib/resumePhotoExport.ts');

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8); out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function encode({ width, height, colorType, depth = 8, rows, filterOf = () => 0, palette, trns, interlace = 0 }) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const scan = [];
  let prev = Buffer.alloc(stride);
  rows.forEach((row, y) => {
    const f = filterOf(y); const cur = Buffer.from(row); const out = Buffer.alloc(stride + 1); out[0] = f;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
      out[x + 1] = (cur[x] - pred) & 255;
    }
    scan.push(out); prev = cur;
  });
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = depth; ihdr[9] = colorType; ihdr[12] = interlace;
  return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    ...(palette ? [chunk('PLTE', Buffer.from(palette))] : []), ...(trns ? [chunk('tRNS', Buffer.from(trns))] : []),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(scan))), chunk('IEND', Buffer.alloc(0))]));
}
function decodeRgb(bytes) {
  const b = Buffer.from(bytes); let o = 8; const idat = []; let w = 0, h = 0, ct = -1, depth = 0;
  while (o < b.length) { const len = b.readUInt32BE(o); const type = b.toString('latin1', o + 4, o + 8); const data = b.subarray(o + 8, o + 8 + len);
    assert.equal(b.readUInt32BE(o + 8 + len), crc(b.subarray(o + 4, o + 8 + len)), `CRC of ${type}`);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; } if (type === 'IDAT') idat.push(data); o += 12 + len; }
  assert.deepEqual([depth, ct], [8, 2], 'opaque 8-bit RGB');
  const raw = zlib.inflateSync(Buffer.concat(idat)); const px = [];
  for (let y = 0; y < h; y++) { assert.equal(raw[y * (w * 3 + 1)], 0); px.push(raw.subarray(y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1))); }
  return { w, h, at: (x, y) => [px[y][x * 3], px[y][x * 3 + 1], px[y][x * 3 + 2]] };
}
const rgba = (...p) => p.flat();

test('fully transparent pixels become pure white regardless of their hidden colour (the black-background bug)', () => {
  const out = decodeRgb(flattenPngOnWhite(encode({ width: 2, height: 1, colorType: 6, rows: [rgba([0, 0, 0, 0], [200, 10, 10, 0])] })).bytes);
  assert.deepEqual(out.at(0, 0), [255, 255, 255]); assert.deepEqual(out.at(1, 0), [255, 255, 255]);
});
test('opaque pixels are unchanged and half-transparent black becomes mid grey', () => {
  const out = decodeRgb(flattenPngOnWhite(encode({ width: 3, height: 1, colorType: 6, rows: [rgba([10, 20, 30, 255], [0, 0, 0, 128], [255, 0, 0, 128])] })).bytes);
  assert.deepEqual(out.at(0, 0), [10, 20, 30]);
  assert.deepEqual(out.at(1, 0), [127, 127, 127]);
  assert.deepEqual(out.at(2, 0), [255, 127, 127]);
});
test('every PNG scanline filter type (none/sub/up/average/paeth) decodes to the same pixels', () => {
  const rows = Array.from({ length: 5 }, (_, y) => rgba(...Array.from({ length: 6 }, (_, x) => [(x * 40 + y * 7) & 255, (x * 13 + y * 50) & 255, (x * 3 + y * 90) & 255, y % 2 ? 255 : 90 + x * 25])));
  const reference = decodeRgb(flattenPngOnWhite(encode({ width: 6, height: 5, colorType: 6, rows })).bytes);
  for (const filter of [1, 2, 3, 4]) {
    const out = decodeRgb(flattenPngOnWhite(encode({ width: 6, height: 5, colorType: 6, rows, filterOf: () => filter })).bytes);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) assert.deepEqual(out.at(x, y), reference.at(x, y), `filter ${filter} @${x},${y}`);
  }
  const mixed = decodeRgb(flattenPngOnWhite(encode({ width: 6, height: 5, colorType: 6, rows, filterOf: (y) => y % 5 })).bytes);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) assert.deepEqual(mixed.at(x, y), reference.at(x, y));
});
test('grey+alpha, RGB with tRNS key, and palette with tRNS all flatten correctly', () => {
  const ga = decodeRgb(flattenPngOnWhite(encode({ width: 2, height: 1, colorType: 4, rows: [[50, 255, 50, 0]] })).bytes);
  assert.deepEqual(ga.at(0, 0), [50, 50, 50]); assert.deepEqual(ga.at(1, 0), [255, 255, 255]);
  const key = decodeRgb(flattenPngOnWhite(encode({ width: 2, height: 1, colorType: 2, rows: [[1, 2, 3, 9, 9, 9]], trns: [0, 9, 0, 9, 0, 9] })).bytes);
  assert.deepEqual(key.at(0, 0), [1, 2, 3]); assert.deepEqual(key.at(1, 0), [255, 255, 255]);
  const pal = decodeRgb(flattenPngOnWhite(encode({ width: 2, height: 1, colorType: 3, rows: [[0, 1]], palette: [0, 0, 0, 255, 0, 0], trns: [255, 0] })).bytes);
  assert.deepEqual(pal.at(0, 0), [0, 0, 0]); assert.deepEqual(pal.at(1, 0), [255, 255, 255]);
});
test('4-bit palette and 16-bit RGBA inputs are supported', () => {
  const pal = decodeRgb(flattenPngOnWhite(encode({ width: 3, height: 1, colorType: 3, depth: 4, rows: [[0x01, 0x20]], palette: [0, 0, 0, 0, 255, 0, 0, 0, 255], trns: [255, 255, 0] })).bytes);
  assert.deepEqual([pal.at(0, 0), pal.at(1, 0), pal.at(2, 0)], [[0, 0, 0], [0, 255, 0], [255, 255, 255]]);
  const wide = decodeRgb(flattenPngOnWhite(encode({ width: 1, height: 1, colorType: 6, depth: 16, rows: [[0, 0, 0, 0, 0, 0, 0, 0]] })).bytes);
  assert.deepEqual(wide.at(0, 0), [255, 255, 255]);
});
test('output is a valid PNG: correct CRCs, passes the existing sanitizer and dimension reader, has no alpha', () => {
  const flat = flattenPngOnWhite(encode({ width: 7, height: 9, colorType: 6, rows: Array.from({ length: 9 }, () => rgba(...Array.from({ length: 7 }, () => [5, 6, 7, 100]))) }));
  const b64 = Buffer.from(flat.bytes).toString('base64');
  assert.equal(pngHasAlpha(b64), false);
  const clean = sanitizeResumePhoto(b64, 'image/png');
  assert.deepEqual(inspectResumePhotoDimensions(decodeResumePhotoBase64(clean.base64), 'image/png'), { width: 7, height: 9 });
  assert.deepEqual([flat.width, flat.height], [7, 9]);
});
test('a realistic 600x800 RGBA image flattens correctly and quickly', () => {
  const w = 600, h = 800; const row = (y) => Array.from({ length: w }, (_, x) => (x < 100 || y < 100 ? [0, 0, 0, 0] : [30, 90, 200, 255])).flat();
  const t0 = Date.now(); const out = decodeRgb(flattenPngOnWhite(encode({ width: w, height: h, colorType: 6, rows: Array.from({ length: h }, (_, y) => row(y)), filterOf: (y) => y % 5 })).bytes);
  assert.deepEqual(out.at(10, 10), [255, 255, 255]); assert.deepEqual(out.at(300, 400), [30, 90, 200]);
  assert.ok(Date.now() - t0 < 5000);
});
test('malformed, interlaced, oversized and unsupported input fails with a readable error, never a partial image', () => {
  const ok = encode({ width: 1, height: 1, colorType: 6, rows: [[0, 0, 0, 0]] });
  assert.throws(() => flattenPngOnWhite(new Uint8Array([1, 2, 3])), /白背景/);
  assert.throws(() => flattenPngOnWhite(encode({ width: 1, height: 1, colorType: 6, rows: [[0, 0, 0, 0]], interlace: 1 })), /白背景/);
  assert.throws(() => flattenPngOnWhite(encode({ width: 2, height: 1, colorType: 0, depth: 2, rows: [[0]] }).slice(0, 40)), /白背景/);
  const corrupt = ok.slice(); corrupt[corrupt.length - 20] ^= 0xff;
  assert.throws(() => flattenPngOnWhite(corrupt), /白背景/);
  const bigHeader = Buffer.from(ok); bigHeader.writeUInt32BE(5000, 16); bigHeader.writeUInt32BE(5000, 20);
  assert.throws(() => flattenPngOnWhite(new Uint8Array(bigHeader)), /白背景/);
});
