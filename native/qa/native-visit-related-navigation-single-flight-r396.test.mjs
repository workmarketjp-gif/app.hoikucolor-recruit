import test from 'node:test';
import assert from 'node:assert/strict';
import { navigateFromCandidateVisitWithLease } from '../src/lib/visitRelatedNavigationLease.ts';
import { createVisitMutationTapGate } from '../src/lib/visitMutationTapGate.ts';

const owner = JSON.stringify(['candidate-a', 'session-a']);
const rows = [{ reservation_id: 'visit-1', job_id: 'job-1', application_id: 'app-1' }];
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function harness({ pinDelay = deferred(), timeoutMs = 1000 } = {}) {
  const gate = createVisitMutationTapGate();
  let active = true;
  let navigations = 0;
  let tokenCalls = 0;
  const args = {
    visits: rows,
    reservationId: 'visit-1', targetId: 'app-1', target: 'application',
    expectedOwnerKey: owner,
    isViewCurrent: () => active,
    gate,
    timeoutMs,
    pin: async () => {
      tokenCalls += 1;
      return pinDelay.promise;
    },
    navigate: () => { navigations += 1; },
  };
  return { args, gate, pinDelay, counts: () => ({ tokenCalls, navigations }), revoke: () => { active = false; gate.invalidate(); } };
}

test('same-frame visit-card double tap launches only one token pin and route', async () => {
  const h = harness();
  const first = navigateFromCandidateVisitWithLease(h.args);
  const second = navigateFromCandidateVisitWithLease(h.args);
  h.pinDelay.resolve({ ownerKey: owner, isCurrent: () => true });
  assert.deepEqual([await first, await second], [true, false]);
  assert.deepEqual(h.counts(), { tokenCalls: 1, navigations: 1 });
  assert.equal(h.gate.isPending(), true);
});

test('App Lock and account switch revoke waiting navigation without affecting later tap', async () => {
  const h = harness();
  const old = navigateFromCandidateVisitWithLease(h.args);
  h.revoke();
  h.pinDelay.resolve({ ownerKey: owner, isCurrent: () => false });
  assert.equal(await old, false);
  assert.equal(h.counts().navigations, 0);
  assert.equal(h.gate.isPending(), false);
});

test('pin timeout releases navigation for a deliberate retry without routing late token', async () => {
  const h = harness({ timeoutMs: 12 });
  assert.equal(await navigateFromCandidateVisitWithLease(h.args), false);
  assert.equal(h.gate.isPending(), false);
  h.pinDelay.resolve({ ownerKey: owner, isCurrent: () => true });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(h.counts().navigations, 0);
});

test('unlinked card must not claim navigation gate or request Clerk token', async () => {
  const h = harness();
  assert.equal(await navigateFromCandidateVisitWithLease({ ...h.args, targetId: 'other' }), false);
  assert.equal(h.gate.isPending(), false);
  assert.deepEqual(h.counts(), { tokenCalls: 0, navigations: 0 });
});

test('rejected pin fails closed without unhandled navigation and releases lane', async () => {
  const h = harness();
  const result = navigateFromCandidateVisitWithLease(h.args);
  h.pinDelay.reject(new Error('private-token-or-server-data'));
  assert.equal(await result, false);
  assert.equal(h.counts().navigations, 0);
  assert.equal(h.gate.isPending(), false);
});
