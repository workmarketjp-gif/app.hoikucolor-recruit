import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { sanitizeResumePhoto, decodeResumePhotoBase64 } from '../src/lib/resumePhotoSanitizer.ts';
import { registerHooks } from 'node:module';
// Node's type-stripper does not resolve Metro's extensionless TS imports; this
// test-only hook lets us execute the real production module without changing it.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === './resumePhotoSanitizer' ? './resumePhotoSanitizer.ts' : specifier, context);
} });
const { prepareResumePhotoPreview } = await import('../src/lib/resumePhotoPreview.ts');

const marker = (code, payload) => Buffer.from([0xff, code, 0, payload.length + 2, ...payload]);
const sos = marker(0xda, [1, 1, 0, 0, 0, 0]);
const base = Buffer.from([0xff, 0xd8]);
const jpeg = (chunks = []) => Buffer.concat([base, ...chunks, marker(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]), sos, Buffer.from([3, 7, 0xff, 0x00, 4, 0xff, 0xd9])]);
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
};
function chunk(type, content) {
  const payload = Buffer.from(content), name = Buffer.from(type), size = Buffer.alloc(4), check = Buffer.alloc(4);
  size.writeUInt32BE(payload.length); check.writeUInt32BE(crc32(Buffer.concat([name, payload])));
  return Buffer.concat([size, name, payload, check]);
}
const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
const png = (extras = []) => {
  const ihdr = Buffer.from([0,0,0,1, 0,0,0,1, 8,6,0,0,0]);
  const idat = deflateSync(Buffer.from([0, 255,0,0,255]));
  return Buffer.concat([pngSignature, chunk('IHDR', ihdr), ...extras, chunk('IDAT', idat), chunk('IEND', [])]);
};

test('JPEG EXIF/GPS, XMP, Photoshop APP and comment are removed from the actual preview URI', () => {
  const original = jpeg([marker(0xe0, [42,43]),marker(0xe1, [...Buffer.from('Exif GPSLatitude')]),
    marker(0xed, [...Buffer.from('Photoshop')]), marker(0xfe, [...Buffer.from('alice@example.org')])]);
  const out = prepareResumePhotoPreview({ base64: original.toString('base64'), mimeType: 'image/jpeg', width: 600, height: 800 });
  const clean = Buffer.from(out.dataUri.split(',')[1], 'base64');
  assert.deepEqual(clean, jpeg());
  assert.equal(out.byteLength, clean.length);
  assert.equal(clean.includes(Buffer.from('GPS')), false);
});

test('JPEG progressive multiple scans remove APP1 that occurs between SOS segments', () => {
  const extra = Buffer.concat([base, sos, Buffer.from([3,7]), marker(0xe1, [...Buffer.from('GPS-longitude')]), sos,
    Buffer.from([0xff, 0x00, 7, 0xff, 0xd9, ...Buffer.from('leaked trailer')])]);
  const out = Buffer.from(sanitizeResumePhoto(extra.toString('base64'), 'image/jpeg').base64, 'base64');
  assert.deepEqual(out, Buffer.concat([base, sos, Buffer.from([3,7]), sos, Buffer.from([0xff,0x00,7,0xff,0xd9])]));
});

test('PNG tEXt/iTXt/eXIf metadata is removed while image pixels remain decodable', () => {
  const original = png([chunk('tEXt', Buffer.from('location\0Christchurch')),
    chunk('iTXt', Buffer.from('candidate\0private')), chunk('eXIf', Buffer.from('GPS'))]);
  const cleaned = Buffer.from(sanitizeResumePhoto(original.toString('base64'), 'image/png').base64, 'base64');
  assert.deepEqual(cleaned, png());
  assert.equal(cleaned.includes(Buffer.from('Christchurch')), false);
  const start = cleaned.indexOf(Buffer.from('IDAT')) + 4;
  const compressed = cleaned.subarray(start, start + cleaned.readUInt32BE(start - 8));
  assert.deepEqual(inflateSync(compressed), Buffer.from([0,255,0,0,255]));
});

test('preserves alpha transparency chunk, but not private ancillary chunks', () => {
  const original = png([chunk('tRNS', [255]),chunk('zTXt', [69, 0, 4, 18])]);
  const cleaned = Buffer.from(sanitizeResumePhoto(original.toString('base64'), 'image/png').base64, 'base64');
  assert.ok(cleaned.includes(Buffer.from('tRNS'))); assert.equal(cleaned.includes(Buffer.from('zTXt')), false);
});

test('unknown critical PNG chunks, invalid JPEG markers and truncated JPEG/PNG reject', () => {
  assert.throws(() => sanitizeResumePhoto(png([chunk('ABCD',[1])]).toString('base64'),'image/png'), /形式/);
  assert.throws(() => sanitizeResumePhoto(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 9]).toString('base64'), 'image/jpeg'), /形式/);
  assert.throws(() => sanitizeResumePhoto(jpeg().subarray(0,7).toString('base64'), 'image/jpeg'), /形式/);
  assert.throws(() => sanitizeResumePhoto(png().subarray(0,18).toString('base64'), 'image/png'), /形式/);
});

test('large or non-canonical base64 and MIME/signature mismatch fail closed', () => {
  for (const input of ['', 'Y===','/9j/$$==', 'Zh==']) {
    assert.throws(() => decodeResumePhotoBase64(input), /読み込めません|10MB/);
  }
  const over = Buffer.alloc(10*1024*1024 + 1, 1).toString('base64');
  assert.throws(() => sanitizeResumePhoto(over, 'image/jpeg'), /10MB/);
  assert.throws(() => prepareResumePhotoPreview({base64: png().toString('base64'), mimeType:'image/jpeg', width:600,height:800}), /一致/);
});

test('byte-identical no-metadata JPEG and PNG do not acquire any extra content', () => {
  for (const [mime, input] of [['image/jpeg',jpeg()],['image/png',png()]]) {
    const clean = sanitizeResumePhoto(input.toString('base64'),mime);
    assert.deepEqual(Buffer.from(clean.base64,'base64'),input);
    assert.equal(clean.byteLength,input.byteLength);
  }
});
