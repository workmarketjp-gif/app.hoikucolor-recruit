import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedPublicJson } from '../response-limit.mjs';

const jsonResponse = (body) => new Response(body, { headers: { 'Content-Type': 'application/json' } });

test('stalled chunked public API body times out without reflecting content', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull() { return new Promise(() => {}); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(
    readBoundedPublicJson(jsonResponse(stream), { deadlineMs: 15 }),
    { message: 'PUBLIC_JOB_SOURCE_BODY_TIMEOUT' },
  );
  assert.equal(cancelled, true);
});

test('public API body deadline is total wall clock across chunks', async () => {
  const stream = new ReadableStream({
    async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 20));
      controller.enqueue(new Uint8Array([32]));
    },
  });
  await assert.rejects(
    readBoundedPublicJson(jsonResponse(stream), { deadlineMs: 30 }),
    { message: 'PUBLIC_JOB_SOURCE_BODY_TIMEOUT' },
  );
});

test('fast valid JSON response completes inside deadline', async () => {
  const data = [{ title: '公開求人' }];
  assert.deepEqual(await readBoundedPublicJson(jsonResponse(JSON.stringify(data)), { deadlineMs: 200 }), data);
});

test('legacy test doubles also cannot hang forever on json()', async () => {
  const response = { json: () => new Promise(() => {}) };
  await assert.rejects(readBoundedPublicJson(response, { deadlineMs: 15 }),
    { message: 'PUBLIC_JOB_SOURCE_BODY_TIMEOUT' });
});

test('public API deadline configuration rejects unsafe values', async () => {
  for (const deadlineMs of [0, -1, 30_001, 1.5, NaN]) {
    await assert.rejects(readBoundedPublicJson(jsonResponse('{}'), { deadlineMs }),
      { message: 'PUBLIC_BODY_DEADLINE_INVALID' });
  }
});

test('oversized upstream payload stays rejected by byte cap', async () => {
  await assert.rejects(readBoundedPublicJson(jsonResponse(new Uint8Array(2_000_001)), { deadlineMs: 200 }),
    { message: 'PUBLIC_JOB_SOURCE_TOO_LARGE' });
});
