import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpotReadConfirmationFence } from '../src/lib/spotConfirmedApplication.ts';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('late pre-confirmation list read cannot reopen a canonically confirmed Spot application', async () => {
  const fence = createSpotReadConfirmationFence();
  const read = deferred();
  let jobs = [{ job_id: 'synthetic-spot', application_id: null }];
  const epoch = fence.captureReadEpoch();
  const readCommit = read.promise.then((fresh) => {
    if (fence.canCommitRead(epoch)) jobs = fresh;
  });
  // Canonical candidate-owned detail has already confirmed this application.
  fence.recordConfirmation();
  jobs = [{ job_id: 'synthetic-spot', application_id: 'synthetic-confirmed' }];
  read.resolve([{ job_id: 'synthetic-spot', application_id: null }]);
  await readCommit;
  assert.equal(jobs[0].application_id, 'synthetic-confirmed');
});

test('later fresh canonical read is accepted, including legitimate status changes', () => {
  const fence = createSpotReadConfirmationFence();
  fence.recordConfirmation();
  assert.equal(fence.canCommitRead(fence.captureReadEpoch()), true);
});

test('multiple confirmations invalidate reads from any earlier epoch', () => {
  const fence = createSpotReadConfirmationFence();
  const old = fence.captureReadEpoch();
  fence.recordConfirmation();
  const middle = fence.captureReadEpoch();
  fence.recordConfirmation();
  assert.equal(fence.canCommitRead(old), false);
  assert.equal(fence.canCommitRead(middle), false);
  assert.equal(fence.canCommitRead(fence.captureReadEpoch()), true);
});

test('independent screen instances do not share read confirmation state', () => {
  const a = createSpotReadConfirmationFence();
  const b = createSpotReadConfirmationFence();
  const readB = b.captureReadEpoch();
  a.recordConfirmation();
  assert.equal(a.canCommitRead(0), false);
  assert.equal(b.canCommitRead(readB), true);
});

test('malformed read tickets cannot bypass confirmation fence', () => {
  const fence = createSpotReadConfirmationFence();
  for (const value of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(fence.canCommitRead(value), false);
  }
});
