import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPinnedCandidateMountLease } from '../src/lib/pinnedCandidateMountLease.ts';

// These are real-source behavioral tests of the lifecycle helper consumed by
// the Clerk/Supabase hook, not a simulated React Native runtime test.
test('fail closed until the effect has mounted', () => {
  const lease = createPinnedCandidateMountLease();
  assert.equal(lease.snapshot(), null);
  assert.equal(lease.isCurrent(null), false);
  assert.equal(lease.isCurrent(0), false);
});

test('a mounted action stays valid while its effect is active', () => {
  const lease = createPinnedCandidateMountLease();
  lease.activate();
  const initiated = lease.snapshot();
  assert.ok(typeof initiated === 'number');
  assert.equal(lease.isCurrent(initiated), true);
});

test('unmount revokes existing actions, including those with the former epoch', () => {
  const lease = createPinnedCandidateMountLease();
  lease.activate();
  const initiated = lease.snapshot();
  lease.revoke();
  assert.equal(lease.snapshot(), null);
  assert.equal(lease.isCurrent(initiated), false);
});

test('React StrictMode setup-cleanup-setup allows NEW actions without revalidating OLD actions', () => {
  const lease = createPinnedCandidateMountLease();
  lease.activate();
  const first = lease.snapshot();
  lease.revoke();
  lease.activate();
  const second = lease.snapshot();
  assert.notEqual(first, second);
  assert.equal(lease.isCurrent(first), false);
  assert.equal(lease.isCurrent(second), true);
});

test('late result of revoked operation stays invalid even after a new mount', async () => {
  const lease = createPinnedCandidateMountLease();
  lease.activate();
  const started = lease.snapshot();
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const result = pending.then(() => lease.isCurrent(started));
  lease.revoke();
  lease.activate();
  resolve();
  assert.equal(await result, false);
});

test('consecutive re-mounts never reuse any previous operation epoch', () => {
  const lease = createPinnedCandidateMountLease();
  const previous = [];
  for (let i = 0; i < 15; i++) {
    lease.activate();
    const started = lease.snapshot();
    assert.ok(previous.every((value) => !lease.isCurrent(value)));
    assert.equal(lease.isCurrent(started), true);
    previous.push(started);
    lease.revoke();
    assert.equal(lease.isCurrent(started), false);
  }
});
