import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/') ? specifier + '.ts' : specifier, context);
} });
const x = await import('../src/lib/resumePhotoExport.ts');

const opaquePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const withColorType = (b64, colorType) => {
  const bytes = Buffer.from(b64, 'base64'); bytes[25] = colorType; return bytes.toString('base64');
};

test('Web spec constants: 600x800 JPEG at 0.88', () => {
  assert.deepEqual([x.RESUME_PHOTO_EXPORT_WIDTH, x.RESUME_PHOTO_EXPORT_HEIGHT, x.RESUME_PHOTO_EXPORT_QUALITY], [600, 800, 0.88]);
});
test('landscape source is cropped to a centred 3:4 column', () => {
  assert.deepEqual(x.centerCropTo3x4(4000, 3000), { originX: 875, originY: 0, width: 2250, height: 3000 });
});
test('portrait taller than 3:4 is cropped top and bottom', () => {
  assert.deepEqual(x.centerCropTo3x4(3000, 6000), { originX: 0, originY: 1000, width: 3000, height: 4000 });
});
test('exact 3:4 source is not cropped', () => {
  assert.deepEqual(x.centerCropTo3x4(600, 800), { originX: 0, originY: 0, width: 600, height: 800 });
});
test('crop always fits inside the source and is 3:4 within one pixel', () => {
  for (const [w, h] of [[5, 7], [1000, 1001], [4032, 3024], [3024, 4032], [999, 3], [3, 999], [1235, 777]]) {
    if (w < 3 || h < 4) { assert.throws(() => x.centerCropTo3x4(w, h)); continue; }
    const c = x.centerCropTo3x4(w, h);
    assert.ok(c.originX >= 0 && c.originY >= 0 && c.originX + c.width <= w && c.originY + c.height <= h, `${w}x${h}`);
    assert.ok(Math.abs(c.width * 4 - c.height * 3) <= 4, `${w}x${h} ratio`);
  }
});
test('invalid dimensions are rejected', () => {
  for (const [w, h] of [[0, 0], [1.5, 4], [-1, 5], [NaN, 4]]) assert.throws(() => x.centerCropTo3x4(w, h));
});
test('PNG alpha detection: opaque RGB passes; RGBA, grey+alpha and tRNS are flagged', () => {
  assert.equal(x.pngHasAlpha(opaquePng), false);
  assert.equal(x.pngHasAlpha(withColorType(opaquePng, 6)), true);
  assert.equal(x.pngHasAlpha(withColorType(opaquePng, 4)), true);
  const bytes = Buffer.from(opaquePng, 'base64');
  const trns = Buffer.concat([bytes.subarray(0, 33), Buffer.from([0, 0, 0, 0, 0x74, 0x52, 0x4e, 0x53, 0, 0, 0, 0]), bytes.subarray(33)]);
  assert.equal(x.pngHasAlpha(trns.toString('base64')), true);
  assert.throws(() => x.pngHasAlpha(Buffer.from('not a png at all, definitely not').toString('base64')));
});

function fakeManipulator({ srcW = 4000, srcH = 3000, outW = 600, outH = 800, outBase64 = 'QUJD', failSecond = false } = {}) {
  const calls = [];
  const fn = async (uri, actions, options) => {
    calls.push({ uri, actions, options });
    if (calls.length === 1) return { uri: 'file:///cache/oriented.jpg', width: srcW, height: srcH };
    if (failSecond) throw new Error('native failure');
    return { uri: 'file:///cache/final.jpg', width: outW, height: outH, base64: outBase64 };
  };
  fn.calls = calls;
  return fn;
}

test('export orients first, then crops, resizes and encodes at Web quality', async () => {
  const m = fakeManipulator();
  const r = await x.exportResumePhoto({ uri: 'file:///cache/pick.jpg', mimeType: 'image/jpeg' }, m);
  assert.deepEqual(m.calls[0].actions, []);
  assert.equal(m.calls[1].uri, 'file:///cache/oriented.jpg');
  assert.deepEqual(m.calls[1].actions, [
    { crop: { originX: 875, originY: 0, width: 2250, height: 3000 } },
    { resize: { width: 600, height: 800 } },
  ]);
  assert.equal(m.calls[1].options.compress, 0.88);
  assert.equal(m.calls[1].options.base64, true);
  assert.deepEqual([r.mimeType, r.width, r.height, r.base64], ['image/jpeg', 600, 800, 'QUJD']);
  assert.deepEqual(r.temporaryUris, ['file:///cache/oriented.jpg', 'file:///cache/final.jpg']);
});
test('export uses the orientation-corrected size, not the picker size', async () => {
  const m = fakeManipulator({ srcW: 3000, srcH: 4000 });
  await x.exportResumePhoto({ uri: 'file:///cache/pick.jpg', mimeType: 'image/jpeg' }, m);
  assert.deepEqual(m.calls[1].actions[0].crop, { originX: 0, originY: 0, width: 3000, height: 4000 });
});
test('wrong output size or missing bytes fail instead of being accepted', async () => {
  for (const opts of [{ outW: 601 }, { outH: 799 }, { outBase64: '' }]) {
    await assert.rejects(x.exportResumePhoto({ uri: 'u', mimeType: 'image/jpeg' }, fakeManipulator(opts)), /600×800/);
  }
});
test('a failing second pass still reports every temporary file for deletion', async () => {
  await assert.rejects(x.exportResumePhoto({ uri: 'u', mimeType: 'image/jpeg' }, fakeManipulator({ failSecond: true })),
    (e) => Array.isArray(e.temporaryUris) && e.temporaryUris.includes('file:///cache/oriented.jpg'));
});
test('unsupported types and PNGs without bytes never reach the image module', async () => {
  const m = fakeManipulator();
  await assert.rejects(x.exportResumePhoto({ uri: 'u', mimeType: 'image/heic' }, m), /JPEGまたはPNG/);
  await assert.rejects(x.exportResumePhoto({ uri: 'u', mimeType: 'image/png', base64: null }, m), /写真を確認できません/);
  await assert.rejects(x.exportResumePhoto({ uri: 'u', mimeType: 'image/png', base64: withColorType(opaquePng, 6) }, m), /白背景/, 'transparent PNG without a temp writer is refused');
  assert.equal(m.calls.length, 0);
});
test('an opaque PNG is accepted and exported as JPEG', async () => {
  const r = await x.exportResumePhoto({ uri: 'u', mimeType: 'image/png', base64: opaquePng }, fakeManipulator());
  assert.equal(r.mimeType, 'image/jpeg');
});

// ---- transparent PNG: flattened onto white before the single JPEG encode ----------------------------------
import zlib from 'node:zlib';
const rgbaPng = (w, h, px) => { // minimal encoder, filter 0, used only as manipulator fixture output
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const ch = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'latin1'); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = px(x >> 2, y, x & 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
};
function pngFlow({ writer } = {}) {
  const calls = []; const written = [];
  const scaledPng = rgbaPng(600, 800, (x, y, c) => (x < 300 ? [0, 0, 0, 0][c] : [10, 20, 30, 255][c])); // left half transparent
  const manipulate = async (uri, actions, options) => {
    calls.push({ uri, actions, options });
    if (calls.length === 1) return { uri: 'file:///cache/oriented.png', width: 4000, height: 3000 };
    if (options.format === 'png') return { uri: 'file:///cache/scaled.png', width: 600, height: 800, base64: scaledPng.toString('base64') };
    return { uri: 'file:///cache/final.jpg', width: 600, height: 800, base64: 'QUJD' };
  };
  const writeTemp = writer ?? (async (bytes) => { written.push(Buffer.from(bytes)); return 'file:///cache/flat.png'; });
  return { calls, written, manipulate, writeTemp };
}
test('transparent PNG: oriented as PNG, scaled as PNG, flattened to white, then ONE jpeg q0.88 encode from the flattened file', async () => {
  const f = pngFlow();
  const r = await x.exportResumePhoto({ uri: 'file:///cache/pick.png', mimeType: 'image/png', base64: withColorType(opaquePng, 6) }, f.manipulate, f.writeTemp);
  assert.equal(f.calls[0].options.format, 'png');
  assert.equal(f.calls[1].options.format, 'png');
  assert.deepEqual(f.calls[1].actions[0].crop, { originX: 875, originY: 0, width: 2250, height: 3000 });
  assert.equal(f.calls[2].uri, 'file:///cache/flat.png');
  assert.deepEqual(f.calls[2].actions, []);
  assert.deepEqual([f.calls[2].options.format, f.calls[2].options.compress], ['jpeg', 0.88]);
  assert.deepEqual([r.mimeType, r.width, r.height], ['image/jpeg', 600, 800]);
  assert.deepEqual(r.temporaryUris, ['file:///cache/oriented.png', 'file:///cache/scaled.png', 'file:///cache/flat.png', 'file:///cache/final.jpg']);
});
test('the bytes handed to the JPEG encoder are opaque RGB with white where the PNG was transparent', async () => {
  const f = pngFlow();
  await x.exportResumePhoto({ uri: 'u', mimeType: 'image/png', base64: withColorType(opaquePng, 6) }, f.manipulate, f.writeTemp);
  const b = f.written[0]; assert.equal(b[25], 2, 'colour type 2 = RGB, no alpha');
  let o = 8; const idat = []; while (o < b.length) { const len = b.readUInt32BE(o); if (b.toString('latin1', o + 4, o + 8) === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len)); o += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const px = (xx, yy) => [...raw.subarray(yy * (600 * 3 + 1) + 1 + xx * 3, yy * (600 * 3 + 1) + 4 + xx * 3)];
  assert.deepEqual(px(10, 10), [255, 255, 255]); assert.deepEqual(px(450, 700), [10, 20, 30]);
});
test('a failing flatten or temp write still reports every temporary file for deletion', async () => {
  const f = pngFlow({ writer: async () => { throw new Error('disk full'); } });
  await assert.rejects(x.exportResumePhoto({ uri: 'u', mimeType: 'image/png', base64: withColorType(opaquePng, 6) }, f.manipulate, f.writeTemp),
    (e) => /disk full/.test(e.message) && e.temporaryUris.includes('file:///cache/oriented.png') && e.temporaryUris.includes('file:///cache/scaled.png'));
});
test('wrong scaled size from the image module is refused before flattening', async () => {
  const f = pngFlow(); const bad = async (u, a, o) => { const r = await f.manipulate(u, a, o); return o.format === 'png' && r.base64 ? { ...r, width: 599 } : r; };
  await assert.rejects(x.exportResumePhoto({ uri: 'u', mimeType: 'image/png', base64: withColorType(opaquePng, 6) }, bad, f.writeTemp), /600×800/);
  assert.equal(f.written.length, 0);
});
