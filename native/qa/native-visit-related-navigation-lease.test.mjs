import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navigateFromCandidateVisitWithLease } from '../src/lib/visitRelatedNavigationLease.ts';

const ownerA = JSON.stringify(['candidate-a', 'session-a']);
const ownerB = JSON.stringify(['candidate-b', 'session-b']);
const reservationId = '00000000-0000-4000-8000-000000000001';
const jobId = '00000000-0000-4000-8000-000000000002';
const applicationId = '00000000-0000-4000-8000-000000000003';
const visits = [{ reservation_id: reservationId, job_id: jobId, application_id: applicationId }];

function harness(options = {}) {
  let current = true;
  let view = true;
  let pinCalls = 0;
  let routes = 0;
  let resumePin;
  const pinWait = options.delayed ? new Promise((resolve) => { resumePin = resolve; }) : null;
  const params = {
    visits: options.visits ?? visits,
    reservationId, targetId: options.targetId ?? applicationId,
    target: options.target ?? 'application',
    expectedOwnerKey: ownerA,
    isViewCurrent: () => view,
    pin: async () => {
      pinCalls++;
      if (pinWait) await pinWait;
      return options.noPin ? null : { ownerKey: options.pinnedOwner ?? ownerA, isCurrent: () => current };
    },
    navigate: () => { routes++; },
  };
  return {
    params,
    revokeSession: () => { current = false; },
    revokeView: () => { view = false; },
    resumePin: () => resumePin?.(),
    counts: () => ({ pinCalls, routes }),
  };
}

test('verified canonical reservation permits its application route', async () => {
  const h = harness();
  assert.equal(await navigateFromCandidateVisitWithLease(h.params), true);
  assert.deepEqual(h.counts(), { pinCalls: 1, routes: 1 });
});

test('verified canonical reservation permits its job route', async () => {
  const h = harness({ target: 'job', targetId: jobId });
  assert.equal(await navigateFromCandidateVisitWithLease(h.params), true);
  assert.equal(h.counts().routes, 1);
});

test('wrong or detached target cannot start a pin or navigate', async () => {
  for (const opts of [
    { target: 'job', targetId: applicationId },
    { target: 'application', targetId: jobId },
    { visits: [{ ...visits[0], application_id: null }] },
    { visits: [] },
    { visits: [visits[0], visits[0]] },
  ]) {
    const h = harness(opts);
    assert.equal(await navigateFromCandidateVisitWithLease(h.params), false);
    assert.deepEqual(h.counts(), { pinCalls: 0, routes: 0 });
  }
});

test('App Lock or focus loss before tap cannot initiate a private pin', async () => {
  const h = harness();
  h.revokeView();
  assert.equal(await navigateFromCandidateVisitWithLease(h.params), false);
  assert.deepEqual(h.counts(), { pinCalls: 0, routes: 0 });
});

test('focus departure/refresh while Clerk pin is pending blocks stale route', async () => {
  const h = harness({ delayed: true });
  const result = navigateFromCandidateVisitWithLease(h.params);
  h.revokeView();
  h.resumePin();
  assert.equal(await result, false);
  assert.deepEqual(h.counts(), { pinCalls: 1, routes: 0 });
});

test('account swap while pin is pending cannot navigate to another candidate route', async () => {
  const h = harness({ delayed: true, pinnedOwner: ownerB });
  const result = navigateFromCandidateVisitWithLease(h.params);
  h.resumePin();
  assert.equal(await result, false);
  assert.equal(h.counts().routes, 0);
});

test('revoked session after pin resolves cannot route', async () => {
  const h = harness({ delayed: true });
  const result = navigateFromCandidateVisitWithLease(h.params);
  h.revokeSession();
  h.resumePin();
  assert.equal(await result, false);
  assert.equal(h.counts().routes, 0);
});

test('unavailable pin never routes', async () => {
  const h = harness({ noPin: true });
  assert.equal(await navigateFromCandidateVisitWithLease(h.params), false);
  assert.equal(h.counts().routes, 0);
});
