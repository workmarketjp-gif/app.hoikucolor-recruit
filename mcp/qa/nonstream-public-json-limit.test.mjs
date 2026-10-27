import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedPublicJson } from '../response-limit.mjs';

// Non-stream responses are legacy/injected test doubles, not production Fetch.
// They must not be an exception to the public JSON output-size contract.
function nonstream(value) {
  return {
    headers: { get: () => null },
    json: async () => value,
  };
}

test('legacy non-stream JSON still permits a small public payload', async () => {
  const value = [{ title: '保育士', prefecture: '東京都' }];
  assert.deepEqual(await readBoundedPublicJson(nonstream(value)), value);
});

test('legacy non-stream JSON rejects an oversized serialized body', async () => {
  const value = [{ title: 'A'.repeat(2_000_001) }];
  await assert.rejects(
    readBoundedPublicJson(nonstream(value)),
    /PUBLIC_JOB_SOURCE_TOO_LARGE/,
  );
});

test('legacy JSON enforces UTF-8 bytes, not JavaScript string length', async () => {
  const value = [{ title: '園'.repeat(670_000) }];
  await assert.rejects(
    readBoundedPublicJson(nonstream(value)),
    /PUBLIC_JOB_SOURCE_TOO_LARGE/,
  );
});

test('legacy JSON serialization failure cannot leak arbitrary exception text', async () => {
  const value = { toJSON() { throw new Error('PRIVATE_ACCOUNT_DETAILS_SHOULD_NOT_LEAK'); } };
  await assert.rejects(
    readBoundedPublicJson(nonstream(value)),
    error => error.message === 'PUBLIC_JOB_SOURCE_INVALID_JSON',
  );
});

test('legacy JSON values without a JSON representation are rejected', async () => {
  for (const value of [undefined, Symbol('not-json')]) {
    await assert.rejects(
      readBoundedPublicJson(nonstream(value)),
      error => error.message === 'PUBLIC_JOB_SOURCE_INVALID_JSON',
    );
  }
});
