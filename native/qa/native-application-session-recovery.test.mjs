import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverAmbiguousApplication } from '../src/lib/ambiguousApplicationRecovery.ts';

const ownerId = 'synthetic-candidate-A';
const sessionId = 'synthetic-session-A';
const jobId = 'synthetic-job';
const confirmed = { id: 'synthetic-application-A', job_id: jobId };

function arrange(overrides = {}) {
  let active = true;
  let current = true;
  const events = [];
  const client = {};
  const lease = { ownerId, ownerSessionId: sessionId, client, isCurrent: () => current };
  const opts = {
    expectedOwnerId: ownerId, expectedSessionId: sessionId, jobId,
    canContinue: () => active,
    pin: async () => lease,
    list: async () => [confirmed],
    onConfirmed: (id) => events.push(id),
    ...overrides,
  };
  return { opts, events, setActive: (v) => { active = v; }, setCurrent: (v) => { current = v; } };
}

test('canonical same-session readback routes exactly once to matching application', async () => {
  const x = arrange();
  assert.equal(await recoverAmbiguousApplication(x.opts), 'confirmed');
  assert.deepEqual(x.events, [confirmed.id]);
});

test('canonical empty or another job is not a fabricated application', async () => {
  for (const rows of [[], [{ id: 'other', job_id: 'different-job' }]]) {
    const x = arrange({ list: async () => rows });
    assert.equal(await recoverAmbiguousApplication(x.opts), 'not_found');
    assert.deepEqual(x.events, []);
  }
});

test('recovery will not fetch a new candidate or Clerk session after account switch', async () => {
  for (const wrong of [
    { ownerId: 'synthetic-candidate-B', ownerSessionId: sessionId },
    { ownerId, ownerSessionId: 'synthetic-session-B' },
  ]) {
    let read = false;
    const x = arrange({ pin: async () => ({ ...wrong, client: {}, isCurrent: () => true }), list: async () => { read = true; return [confirmed]; } });
    assert.equal(await recoverAmbiguousApplication(x.opts), 'quarantined');
    assert.equal(read, false);
    assert.deepEqual(x.events, []);
  }
});

test('logout/App Lock before pin makes no network reads', async () => {
  let pinCalled = false;
  const x = arrange({ pin: async () => { pinCalled = true; return null; } });
  x.setActive(false);
  assert.equal(await recoverAmbiguousApplication(x.opts), 'quarantined');
  assert.equal(pinCalled, false);
});

test('logout or focus change during pending read prevents stale navigation', async () => {
  let resolveList;
  const pending = new Promise((resolve) => { resolveList = resolve; });
  const x = arrange({ list: async () => pending });
  const recovery = recoverAmbiguousApplication(x.opts);
  await Promise.resolve(); await Promise.resolve();
  x.setActive(false);
  resolveList([confirmed]);
  assert.equal(await recovery, 'quarantined');
  assert.deepEqual(x.events, []);
});

test('revoked pinned session after read prevents navigation', async () => {
  const x = arrange({ list: async () => { x.setCurrent(false); return [confirmed]; } });
  assert.equal(await recoverAmbiguousApplication(x.opts), 'quarantined');
  assert.deepEqual(x.events, []);
});

test('server read failure reports uncertainty, never claims application absence', async () => {
  const x = arrange({ list: async () => { throw new Error('network offline'); } });
  assert.equal(await recoverAmbiguousApplication(x.opts), 'read_failed');
  assert.deepEqual(x.events, []);
});

test('pin failure reports uncertainty while revoked pin quarantines', async () => {
  const x = arrange({ pin: async () => { throw new Error('token acquisition error'); } });
  assert.equal(await recoverAmbiguousApplication(x.opts), 'read_failed');
  assert.deepEqual(x.events, []);
  const y = arrange({ pin: async () => null });
  assert.equal(await recoverAmbiguousApplication(y.opts), 'quarantined');
});
