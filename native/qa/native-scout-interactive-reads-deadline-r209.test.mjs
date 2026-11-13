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
  const lookup = async () => {
    const pinned = await boundedPrivateRead(() => new Promise(() => {}), 12);
    return boundedPrivateRead(() => { queried += 1; return Promise.resolve([pinned]); }, 12);
  };
  await assert.rejects(lookup(), /タイムアウト/);
  assert.equal(queried, 0);
});

test('explicit manual retry is possible after a failed read, with no automatic retry', async () => {
  let calls = 0;
  const load = () => {
    calls += 1;
    return calls === 1 ? new Promise(() => {}) : Promise.resolve([{ scout_id: 'synthetic-fresh' }]);
  };
  await assert.rejects(boundedPrivateRead(load, 15), /タイムアウト/);
  assert.equal(calls, 1);
  assert.deepEqual(await boundedPrivateRead(load, 100), [{ scout_id: 'synthetic-fresh' }]);
  assert.equal(calls, 2);
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
