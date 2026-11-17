import assert from 'node:assert/strict';
import test from 'node:test';
import { pinCandidateForRead } from '../src/lib/pinnedCandidateRead.ts';
import { boundedPrivateRead } from '../src/lib/privateReadDeadline.ts';

const livePin = { isCurrent: () => true, ownerId: 'synthetic-candidate', ownerSessionId: 'synthetic-session' };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('detail load does not request a Clerk token when the screen lease is already lost', async () => {
  let tokenRequests = 0;
  await assert.rejects(pinCandidateForRead(async () => { tokenRequests++; return livePin; }, () => false, 15));
  assert.equal(tokenRequests, 0);
});

test('detail cannot read canonical candidate data when token resolution stalls', async () => {
  let finishToken;
  const outstandingToken = new Promise((resolve) => { finishToken = resolve; });
  await assert.rejects(pinCandidateForRead(() => outstandingToken, () => true, 12), /タイムアウト/);
  finishToken(livePin);
  await delay(2);
});

test('stale Clerk session is rejected before canonical read', async () => {
  await assert.rejects(pinCandidateForRead(async () => ({ isCurrent: () => false }), () => true, 20));
});

test('in-flight canonical job/profile/application read has a bounded UI deadline', async () => {
  let finishRead;
  const outstandingRead = new Promise((resolve) => { finishRead = resolve; });
  const pinned = await pinCandidateForRead(async () => livePin, () => true, 30);
  assert.equal(pinned.ownerId, 'synthetic-candidate');
  const result = boundedPrivateRead(() => outstandingRead, 12);
  await assert.rejects(result, /タイムアウト/);
  finishRead({ job: 'late synthetic job' });
  await delay(2);
});

test('canonical read errors remain errors and cannot be represented as an empty job', async () => {
  await assert.rejects(boundedPrivateRead(async () => { throw new Error('offline'); }, 30), /offline/);
});

test('successful pinned current session reads a canonical synthetic payload', async () => {
  const pinned = await pinCandidateForRead(async () => livePin, () => true, 30);
  const snapshot = await boundedPrivateRead(async () => {
    assert.ok(pinned.isCurrent());
    return { job: { id: 'synthetic-job' }, applications: [] };
  }, 30);
  assert.equal(snapshot.job.id, 'synthetic-job');
});

test('screen that blurs during token resolution cannot use a late token', async () => {
  let current = true;
  let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const attempt = pinCandidateForRead(() => waiting, () => current, 50);
  await delay(2);
  current = false;
  finish(livePin);
  await assert.rejects(attempt, /安全なログイン状態/);
});
