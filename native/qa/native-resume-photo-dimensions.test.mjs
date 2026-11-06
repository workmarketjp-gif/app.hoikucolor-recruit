import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectResumePhotoDimensions, RESUME_PHOTO_MAX_EDGE, RESUME_PHOTO_MAX_PIXELS } from '../src/lib/resumePhotoDimensions.ts';

const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');
const segment = (marker, bytes) => Buffer.from([0xff, marker, 0, bytes.length + 2, ...bytes]);
const jpeg = (width, height, extra = []) => Buffer.concat([
  Buffer.from([0xff, 0xd8]), ...extra,
  segment(0xc0, [8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 0x11, 0]),
  segment(0xda, [1, 1, 0, 0, 0, 0]), Buffer.from([0x0a, 0xff, 0xd9]),
]);

test('reads the true 1×1 PNG dimensions from the decoded IHDR', () => {
  assert.deepEqual(inspectResumePhotoDimensions(png1x1, 'image/png'), { width: 1, height: 1 });
});
test('reads a 3:4 JPEG SOF after non-image marker segments', () => {
  assert.deepEqual(inspectResumePhotoDimensions(jpeg(600, 800, [segment(0xe0, [1, 2, 3])]), 'image/jpeg'), { width: 600, height: 800 });
});
test('supports progressive SOF2 and ignores JPEG APP data before SOF', () => {
  const input = jpeg(1200, 1600, [segment(0xe1, [...Buffer.from('EXIF')])]);
  input[input.indexOf(Buffer.from([0xff, 0xc0])) + 1] = 0xc2;
  assert.deepEqual(inspectResumePhotoDimensions(input, 'image/jpeg'), { width: 1200, height: 1600 });
});
test('rejects incomplete, spoofed and zero-size image headers', () => {
  for (const invalid of [png1x1.subarray(0, 23), Buffer.alloc(40), Buffer.from(png1x1).fill(0, 16, 20)]) {
    assert.throws(() => inspectResumePhotoDimensions(invalid, 'image/png'), /サイズ/);
  }
  for (const invalid of [jpeg(600, 800).subarray(0, 4), jpeg(0, 800), Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])]) {
    assert.throws(() => inspectResumePhotoDimensions(invalid, 'image/jpeg'), /サイズ/);
  }
});
test('wrong MIME is not silently interpreted as another format', () => {
  assert.throws(() => inspectResumePhotoDimensions(png1x1, 'image/jpeg'), /サイズ/);
  assert.throws(() => inspectResumePhotoDimensions(jpeg(600, 800), 'image/png'), /サイズ/);
});

// The source's sanitization layer validates container/chunk structure; this
// test exercises the next decoder boundary with attacker-controlled dimensions.
const pngHeader = (width, height) => {
  const b = Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]).copy(b,0);
  b.writeUInt32BE(width,16); b.writeUInt32BE(height,20);
  b[24]=8; b[25]=6;
  return b;
};
const jpgHeader = (width, height) => Buffer.from([
  0xff,0xd8,0xff,0xc0,0,11,8,
  height >> 8, height & 255, width >> 8, width & 255,
  1,1,0x11,0,
]);

test('allows ordinary JPEG/PNG head sizes including a 48 MP camera image', () => {
  assert.deepEqual(inspectResumePhotoDimensions(pngHeader(8000,6000),'image/png'),{width:8000,height:6000});
  assert.deepEqual(inspectResumePhotoDimensions(jpgHeader(8000,6000),'image/jpeg'),{width:8000,height:6000});
  assert.deepEqual(inspectResumePhotoDimensions(jpgHeader(600,800),'image/jpeg'),{width:600,height:800});
});
test('rejects small compressed PNG with declared giant memory footprint', () => {
  for (const [width,height] of [[10000,10000],[0xffffffff,1],[1,0xffffffff],[RESUME_PHOTO_MAX_EDGE+1,1]]) {
    assert.throws(()=>inspectResumePhotoDimensions(pngHeader(width,height),'image/png'),/サイズ/);
  }
});
test('rejects JPEG dimensions whose total pixels exceed the safe limit', () => {
  assert.throws(()=>inspectResumePhotoDimensions(jpgHeader(12000,12000),'image/jpeg'),/サイズ/);
  assert.deepEqual(inspectResumePhotoDimensions(jpgHeader(10000,8000),'image/jpeg'),{width:10000,height:8000});
});
test('reports stable explicit limits and rejects zero-byte dimensions', () => {
  assert.equal(RESUME_PHOTO_MAX_PIXELS,80_000_000);
  assert.equal(RESUME_PHOTO_MAX_EDGE,16_384);
  assert.throws(()=>inspectResumePhotoDimensions(pngHeader(0,0),'image/png'),/サイズ/);
  assert.throws(()=>inspectResumePhotoDimensions(jpgHeader(0,600),'image/jpeg'),/サイズ/);
});
