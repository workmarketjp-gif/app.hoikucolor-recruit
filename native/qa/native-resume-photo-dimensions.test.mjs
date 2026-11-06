import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectResumePhotoDimensions } from '../src/lib/resumePhotoDimensions.ts';

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
