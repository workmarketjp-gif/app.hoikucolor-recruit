import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedPublicJson } from '../response-limit.mjs';

test('bounded reader decodes valid chunked JSON', async () => {
  const data = new TextEncoder().encode('[{"ok":true}]');
  const stream = new ReadableStream({ start(c) { c.enqueue(data.subarray(0, 3)); c.enqueue(data.subarray(3)); c.close(); } });
  assert.deepEqual(await readBoundedPublicJson(new Response(stream)), [{ ok: true }]);
});
test('bounded reader cancels oversized stream with no length header', async () => {
  let cancelled = false;
  let reads = 0;
  const stream = new ReadableStream({ pull(c) { reads++; c.enqueue(new Uint8Array(262_144)); }, cancel() { cancelled = true; } });
  await assert.rejects(readBoundedPublicJson(new Response(stream)), /PUBLIC_JOB_SOURCE_TOO_LARGE/);
  assert.equal(cancelled, true);
  assert.ok(reads <= 10);
});
test('bounded reader rejects forged short length and bad UTF-8', async () => {
  await assert.rejects(readBoundedPublicJson(new Response(new Uint8Array(2_000_001), {
    headers: { 'content-length': '10' },
  })), /PUBLIC_JOB_SOURCE_TOO_LARGE/);
  await assert.rejects(readBoundedPublicJson(new Response(new Uint8Array([91, 255, 93]))), /PUBLIC_JOB_SOURCE_INVALID_JSON/);
});
test('bounded reader rejects excessive declared length', async () => {
  await assert.rejects(readBoundedPublicJson(new Response('[]', {
    headers: { 'content-length': '2000001' },
  })), /PUBLIC_JOB_SOURCE_TOO_LARGE/);
});
