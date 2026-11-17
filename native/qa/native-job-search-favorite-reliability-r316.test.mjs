import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSavedJobMutationWithinDeadline } from '../src/lib/savedJobMutationDeadline.ts';
import { pinCandidateForRead } from '../src/lib/pinnedCandidateRead.ts';

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('search-card save waits for a real saved-ID readback and sends once', async () => {
  let sent = 0;
  let reads = 0;
  const saved = await confirmSavedJobMutationWithinDeadline('job-search-1', true,
    async () => { sent += 1; },
    async () => { reads += 1; return ['job-search-1']; },
    () => true, 200);
  assert.deepEqual(saved, ['job-search-1']);
  assert.equal(sent, 1);
  assert.equal(reads, 1);
});

test('search-card removal is unconfirmed until canonical ID is absent', async () => {
  let sent = 0;
  await assert.rejects(
    confirmSavedJobMutationWithinDeadline('job-search-1', false,
      async () => { sent += 1; },
      async () => ['job-search-1'], () => true, 200),
    /保存状況を確認できません/,
  );
  assert.equal(sent, 1);
});

test('search-card token pin timeout prevents launching any write', async () => {
  let sent = 0;
  let finishPin;
  const pendingPin = new Promise((resolve) => { finishPin = resolve; });
  await assert.rejects(
    pinCandidateForRead(() => pendingPin, () => true, 15).then(() => {
      sent += 1;
    }), /タイムアウト/,
  );
  finishPin({ isCurrent: () => true });
  await tick(4);
  assert.equal(sent, 0);
});

test('search-card revoked generation prevents a delayed write launch', async () => {
  let current = true;
  let sent = 0;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-search-1', true,
    async () => { sent += 1; }, async () => ['job-search-1'],
    () => current = false, 100), /安全なログイン状態/);
  assert.equal(sent, 0);
});

test('search-card ack deadline is an unknown result, never an automatic retry or late read', async () => {
  let resolveAck;
  const pendingAck = new Promise((resolve) => { resolveAck = resolve; });
  let sent = 0;
  let reads = 0;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-search-1', true,
    () => { sent += 1; return pendingAck; },
    async () => { reads += 1; return ['job-search-1']; }, () => true, 15), /タイムアウト/);
  resolveAck();
  await tick(4);
  assert.equal(sent, 1);
  assert.equal(reads, 0);
});

test('search-card session lost after save ack prevents canonical private read', async () => {
  let current = true;
  let reads = 0;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-search-1', true,
    async () => { current = false; },
    async () => { reads += 1; return ['job-search-1']; }, () => current, 200),
  /安全なログイン状態/);
  assert.equal(reads, 0);
});
