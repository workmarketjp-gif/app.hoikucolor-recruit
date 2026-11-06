import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeResumePhotoCacheRecord, decodeResumePhotoCacheRecord } from '../src/lib/resumePhotoCacheRecord.ts';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';
const photo = (overrides = {}) => ({ dataUri: `data:image/png;base64,${png}`, mimeType: 'image/png',
  width: 1, height: 1, byteLength: Buffer.from(png, 'base64').length, ...overrides });

test('app-private record round trips image bytes/dimensions with no owner identifiers', () => {
  const record = encodeResumePhotoCacheRecord(photo());
  assert.equal(record.includes('candidate'), false);
  assert.deepEqual(decodeResumePhotoCacheRecord(record), {
    base64: png, mimeType: 'image/png', width: 1, height: 1,
    byteLength: Buffer.from(png, 'base64').length,
  });
});
test('rejects bad URI, spoofed MIME, fake lengths and malformed source', () => {
  for (const overrides of [
    { dataUri: `data:image/jpeg;base64,${png}` }, { mimeType: 'image/jpeg' },
    { dataUri: 'file:///private/candidate.png' }, { byteLength: 12 },
    { width: 0 }, { height: Infinity }, { dataUri: 'data:image/png;base64,////=' },
  ]) assert.throws(() => encodeResumePhotoCacheRecord(photo(overrides)));
});
test('stored record is not trusted: malformed/oversized/version/type/length records reject', () => {
  const normal = JSON.parse(encodeResumePhotoCacheRecord(photo()));
  for (const value of ['', 'null', '{', '[]', JSON.stringify({ ...normal, version: 2 }),
    JSON.stringify({ ...normal, mimeType: 'text/plain' }), JSON.stringify({ ...normal, byteLength: 999 }),
    JSON.stringify({ ...normal, base64: 'abc' }), JSON.stringify({ ...normal, width: -5 }),
    ' '.repeat(14 * 1024 * 1024 + 1025)]) assert.throws(() => decodeResumePhotoCacheRecord(value));
});
