import assert from 'node:assert/strict';
import test from 'node:test';
import { respondCandidateInterviewWithLease } from '../src/lib/interviewResponseSessionLease.ts';

function harness(overrides = {}) {
  const calls = [];
  const options = {
    isCurrent: () => true,
    prepare: async () => { calls.push('prepare'); },
    invoke: async () => { calls.push('invoke'); },
    readback: async () => { calls.push('readback'); return { status: 'accepted' }; },
    confirms: (detail) => detail?.status === 'accepted',
    clear: async () => { calls.push('clear'); },
    ...overrides,
  };
  return { calls, options };
}

test('exact canonical confirmation clears receipt only after authorized RPC/readback', async () => {
  const { calls, options } = harness();
  assert.deepEqual(await respondCandidateInterviewWithLease(options), { status: 'accepted' });
  assert.deepEqual(calls, ['prepare', 'invoke', 'readback', 'clear']);
});

test('logout or App Lock during slow SecureStore preparation never invokes interview RPC', async () => {
  let releasePrepare;
  let current = true;
  const { calls, options } = harness({
    isCurrent: () => current,
    prepare: () => new Promise((resolve) => { calls.push('prepare'); releasePrepare = resolve; }),
  });
  const response = respondCandidateInterviewWithLease(options);
  current = false;
  releasePrepare();
  await assert.rejects(response, /認証または閲覧状態/);
  assert.deepEqual(calls, ['prepare']);
});

test('screen blur while RPC is pending prevents readback and receipt deletion', async () => {
  let releaseRpc;
  let current = true;
  const { calls, options } = harness({
    isCurrent: () => current,
    invoke: () => new Promise((resolve) => { calls.push('invoke'); releaseRpc = resolve; }),
  });
  const response = respondCandidateInterviewWithLease(options);
  await new Promise((resolve) => setImmediate(resolve));
  current = false;
  releaseRpc();
  await assert.rejects(response, /認証または閲覧状態/);
  assert.deepEqual(calls, ['prepare', 'invoke']);
});

test('rejected canonical answer cannot delete durable receipt', async () => {
  const { calls, options } = harness({ readback: async () => { calls.push('readback'); return { status: 'declined' }; } });
  await assert.rejects(respondCandidateInterviewWithLease(options), /反映を確認できません/);
  assert.deepEqual(calls, ['prepare', 'invoke', 'readback']);
});

test('revocation during canonical readback keeps receipt and never publishes success', async () => {
  let current = true;
  const { calls, options } = harness({
    isCurrent: () => current,
    readback: async () => { calls.push('readback'); current = false; return { status: 'accepted' }; },
  });
  await assert.rejects(respondCandidateInterviewWithLease(options), /認証または閲覧状態/);
  assert.deepEqual(calls, ['prepare', 'invoke', 'readback']);
});

test('preparation failure and RPC failure never trigger retries', async () => {
  const a = harness({ prepare: async () => { throw new Error('SecureStore unavailable'); } });
  await assert.rejects(respondCandidateInterviewWithLease(a.options), /SecureStore unavailable/);
  assert.deepEqual(a.calls, []);
  const b = harness({ invoke: async () => { b.calls.push('invoke'); throw new Error('transport ambiguous'); } });
  await assert.rejects(respondCandidateInterviewWithLease(b.options), /transport ambiguous/);
  assert.deepEqual(b.calls, ['prepare', 'invoke']);
});

test('revoked before starting preparation never calls storage or RPC', async () => {
  const { calls, options } = harness({ isCurrent: () => false });
  await assert.rejects(respondCandidateInterviewWithLease(options), /認証または閲覧状態/);
  assert.deepEqual(calls, []);
});
