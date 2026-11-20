import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverAmbiguousApplication } from '../src/lib/ambiguousApplicationRecovery.ts';

const ownerId = 'synthetic-candidate-A';
const ownerSessionId = 'synthetic-session-A';
const jobId = 'synthetic-job';
const matched = { id: 'synthetic-application-A', job_id: jobId };
const lease = { ownerId, ownerSessionId, client: {}, isCurrent: () => true };
const never = () => new Promise(() => undefined);
function setup(patch = {}) {
  const navigations = [];
  let active = true;
  let reads = 0;
  return {
    navigations,
    reads: () => reads,
    revoke: () => { active = false; },
    options: {
      expectedOwnerId: ownerId, expectedSessionId: ownerSessionId, jobId,
      canContinue: () => active,
      pin: async () => lease,
      list: async () => { reads++; return [matched]; },
      onConfirmed: (id) => navigations.push(id),
      timeoutMs: 25,
      ...patch,
    },
  };
}

test('indefinitely pending Clerk pin stops recovery without starting a private list read', async () => {
  const x = setup({ pin: never });
  assert.equal(await recoverAmbiguousApplication(x.options), 'read_failed');
  assert.equal(x.reads(), 0);
  assert.deepEqual(x.navigations, []);
});

test('late Clerk pin resolution after deadline must not initiate canonical list', async () => {
  let resolvePin;
  const pending = new Promise(resolve => { resolvePin = resolve; });
  const x = setup({ pin: () => pending });
  assert.equal(await recoverAmbiguousApplication(x.options), 'read_failed');
  resolvePin(lease);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(x.reads(), 0);
  assert.deepEqual(x.navigations, []);
});

test('indefinitely pending canonical list read returns uncertainty and does not navigate', async () => {
  let reads = 0;
  const x = setup({ list: () => { reads++; return never(); } });
  assert.equal(await recoverAmbiguousApplication(x.options), 'read_failed');
  assert.equal(reads, 1);
  assert.deepEqual(x.navigations, []);
});

test('late canonical success after deadline never triggers delayed navigation', async () => {
  let resolveList;
  const pending = new Promise(resolve => { resolveList = resolve; });
  const x = setup({ list: () => pending });
  assert.equal(await recoverAmbiguousApplication(x.options), 'read_failed');
  resolveList([matched]);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(x.navigations, []);
});

test('privacy lease revoked during hung recovery reports quarantine, not read confirmation', async () => {
  const x = setup({ list: never });
  const result = recoverAmbiguousApplication(x.options);
  setTimeout(() => x.revoke(), 5);
  assert.equal(await result, 'quarantined');
  assert.deepEqual(x.navigations, []);
});
