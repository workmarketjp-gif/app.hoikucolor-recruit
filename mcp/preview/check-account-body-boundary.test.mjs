import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedCloudflareJson } from './check-account-readonly.mjs';

const payload = { success: true, result: [{ id: 'synthetic-worker' }] };

test('read-only inventory consumes a small genuine JSON body', async () => {
  const response = new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
  assert.deepEqual(await readBoundedCloudflareJson(response, { deadlineMs: 500 }), payload);
});

test('unannounced oversized streamed Cloudflare JSON is rejected before buffering', async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(600_000));
      controller.enqueue(new Uint8Array(500_000));
      controller.close();
    },
  });
  await assert.rejects(readBoundedCloudflareJson(new Response(stream), { deadlineMs: 500 }),
    { message: 'CLOUDFLARE_RESPONSE_TOO_LARGE' });
});

test('false small content-length cannot defeat actual byte limit', async () => {
  const response = new Response(new Uint8Array(1_048_577), {
    headers: { 'content-length': '1' },
  });
  await assert.rejects(readBoundedCloudflareJson(response, { deadlineMs: 500 }),
    { message: 'CLOUDFLARE_RESPONSE_TOO_LARGE' });
});

test('stalling chunked response hits a total body deadline and cancels reader', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    pull() { return new Promise(() => {}); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readBoundedCloudflareJson(new Response(stream), { deadlineMs: 25 }),
    { message: 'CLOUDFLARE_RESPONSE_TIMEOUT' });
  assert.equal(cancelled, true);
});

test('invalid UTF-8 or malformed JSON fails closed without printing raw body', async () => {
  for (const input of [new Uint8Array([0xff]), '{"secret":"PRIVATE"']) {
    const response = new Response(input);
    await assert.rejects(readBoundedCloudflareJson(response, { deadlineMs: 500 }), error =>
      error.message === 'CLOUDFLARE_RESPONSE_INVALID' && !error.message.includes('PRIVATE'));
  }
});

test('invalid or oversized claimed length rejects before body parsing', async () => {
  for (const claimed of ['garbled', '-1', '1048577', '9999999999999999999999999999999999']) {
    const response = new Response('{}', { headers: { 'content-length': claimed } });
    await assert.rejects(readBoundedCloudflareJson(response, { deadlineMs: 500 }),
      { message: 'CLOUDFLARE_RESPONSE_TOO_LARGE' });
  }
});

test('invalid deadline cannot silently disable bounded reads', async () => {
  for (const deadlineMs of [0, -1, 1.5, Number.NaN, 30_001]) {
    await assert.rejects(readBoundedCloudflareJson(new Response('{}'), { deadlineMs }),
      { message: 'CLOUDFLARE_RESPONSE_INVALID' });
  }
});
