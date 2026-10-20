import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPublicChildcareJobs, listPublicChildcareJobFilters } from '../public-jobs.mjs';

const url = 'https://kcmmpjyngcysdfbumchk.supabase.co';
const key = 'sb_publishable_local_qa';
const config = (fetcher) => ({ supabaseUrl: url, publishableKey: key, fetcher });
const fakeResponse = (body, headers = {}) => new Response(body, {
  status: 200, headers: { 'content-type': 'application/json', ...headers },
});

test('accept valid chunked JSON without declared content-length', async () => {
  const data = JSON.stringify([{ prefectures: ['東京都'], employment_types: ['正社員'] }]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({ start(controller) {
    for (const text of [data.slice(0, 20), data.slice(20)]) controller.enqueue(encoder.encode(text));
    controller.close();
  }});
  const result = await listPublicChildcareJobFilters({}, config(async () => fakeResponse(stream)));
  assert.deepEqual(result.prefectures, ['東京都']);
  assert.deepEqual(result.employment_types, ['正社員']);
});

test('oversized stream lacking content-length is rejected before JSON parsing', async () => {
  let chunksSent = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      chunksSent++;
      controller.enqueue(new Uint8Array(262_144).fill(32));
    },
    cancel() { cancelled = true; },
  });
  await assert.rejects(
    searchPublicChildcareJobs({}, config(async () => fakeResponse(stream))),
    /PUBLIC_JOB_SOURCE_TOO_LARGE/,
  );
  assert.equal(cancelled, true);
  assert.ok(chunksSent <= 10, 'upstream should not be fully buffered');
});

test('falsified short content-length does not defeat the stream limit', async () => {
  const bytes = new Uint8Array(2_000_001).fill(32);
  const stream = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
  await assert.rejects(
    searchPublicChildcareJobs({}, config(async () => fakeResponse(stream, { 'content-length': '15' }))),
    /PUBLIC_JOB_SOURCE_TOO_LARGE/,
  );
});

test('oversized declared content-length is rejected before parsing', async () => {
  const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1)); c.close(); } });
  await assert.rejects(
    searchPublicChildcareJobs({}, config(async () => fakeResponse(stream, { 'content-length': '2000001' }))),
    /PUBLIC_JOB_SOURCE_TOO_LARGE/,
  );
});

test('malformed UTF-8 streamed response is rejected without reflecting bytes', async () => {
  const bad = new Uint8Array([0x5b, 0xff, 0x5d]);
  await assert.rejects(
    searchPublicChildcareJobs({}, config(async () => fakeResponse(bad))),
    /PUBLIC_JOB_SOURCE_INVALID_JSON/,
  );
});

test('empty streamed response fails closed', async () => {
  await assert.rejects(
    searchPublicChildcareJobs({}, config(async () => fakeResponse(new Uint8Array(0)))),
    /PUBLIC_JOB_SOURCE_INVALID_JSON/,
  );
});

test('valid JSON with too many records still rejected after byte guard', async () => {
  const payload = JSON.stringify(Array.from({ length: 52 }, () => ({})));
  await assert.rejects(
    searchPublicChildcareJobs({}, config(async () => fakeResponse(payload))),
    /PUBLIC_JOB_SOURCE_EXCESSIVE_ROWS/,
  );
});
