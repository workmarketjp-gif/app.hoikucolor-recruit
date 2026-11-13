import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedPrivateRead } from '../src/lib/privateReadDeadline.ts';

// Candidate-private, READ-ONLY manual refresh/search stages are bounded.
// Expiry of a presentation deadline is not proof of network cancellation.
test('a hanging canonical scout refresh settles without a duplicate RPC', async () => {
  let finishLate;
  const pending = new Promise(resolve => { finishLate = resolve; });
  let calls = 0;
  await assert.rejects(
    boundedPrivateRead(() => { calls++; return pending; }, 20),
    /タイムアウト/,
  );
  assert.equal(calls, 1);
  finishLate([{ scout_id: 'synthetic-stale' }]);
  await new Promise(resolve => setImmediate(resolve));
});

test('organization search timeout is an error, never a fabricated empty result', async () => {
  await assert.rejects(
    boundedPrivateRead(() => new Promise(() => {}), 15),
    /タイムアウト/,
  );
});

test('hanging candidate pin also times out before read-only lookup launches', async () => {
  let queried = 0;
  await assert.rejects(
    boundedPrivateRead(() => new Promise(() => {}), 12),
    /タイムアウト/,
  );
  assert.equal(queried, 0);
});

test('an RPC rejection stays an error and never becomes zero matches', async () => {
  await assert.rejects(
    boundedPrivateRead(() => Promise.reject(new Error('synthetic permission denied')), 100),
    /synthetic permission denied/,
  );
});

test('late RPC rejection after timeout is observed and settles the caller once', async () => {
  let lateReject;
  const hanging = new Promise((_, reject) => { lateReject = reject; });
  let completions = 0;
  await assert.rejects(
    boundedPrivateRead(() => hanging, 15).finally(() => { completions++; }),
    /タイムアウト/,
  );
  lateReject(new Error('synthetic delayed disconnect'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completions, 1);
});

test('a successful lookup returns the exact canonical list object', async () => {
  const canonical = [{ organization_id: 'synthetic-id', organization_name: 'Synthetic Test Nursery' }];
  assert.strictEqual(await boundedPrivateRead(() => Promise.resolve(canonical), 100), canonical);
});
