import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSavedJobMutationWithinDeadline } from '../src/lib/savedJobMutationDeadline.ts';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mutate = async () => {};

test('confirmed save is shown only after the canonical ID readback', async () => {
  const order = [];
  const result = await confirmSavedJobMutationWithinDeadline('job-1', true,
    async () => { order.push('save'); },
    async () => { order.push('read'); return ['job-1']; }, () => true, 100);
  assert.deepEqual(order, ['save', 'read']);
  assert.deepEqual(result, ['job-1']);
});

test('confirmed removal requires canonical absence', async () => {
  const ids = await confirmSavedJobMutationWithinDeadline('job-1', false, mutate,
    async () => ['job-2'], () => true, 100);
  assert.deepEqual(ids, ['job-2']);
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', false,
    mutate, async () => ['job-1'], () => true, 100), /保存状況を確認できません/);
});

test('invalid or unconfirmed canonical IDs never imply successful save', async () => {
  for (const ids of [[], [null], ['job-other']]) {
    await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', true,
      mutate, async () => ids, () => true, 100), /保存状況を確認できません/);
  }
});

test('revoked screen or candidate lease prevents invoking mutation', async () => {
  let sent = 0;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', true,
    async () => { sent++; }, async () => [], () => false, 30), /安全なログイン状態/);
  assert.equal(sent, 0);
});

test('a lost session during the mutation never launches a candidate-private reread', async () => {
  let current = true;
  let readCount = 0;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', true,
    async () => { current = false; },
    async () => { readCount++; return ['job-1']; }, () => current, 100), /安全なログイン状態/);
  assert.equal(readCount, 0);
});

test('hanging mutation acknowledgement times out once, without retry or late read', async () => {
  let finish;
  const ack = new Promise((resolve) => { finish = resolve; });
  let sent = 0;
  let readCount = 0;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', true,
    () => { sent++; return ack; },
    async () => { readCount++; return ['job-1']; }, () => true, 12), /タイムアウト/);
  finish();
  await delay(4);
  assert.equal(sent, 1);
  assert.equal(readCount, 0);
});

test('late rejected acknowledgment is observed but cannot be mistaken for success', async () => {
  let rejectAck;
  const ack = new Promise((_, reject) => { rejectAck = reject; });
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', true,
    () => ack, async () => ['job-1'], () => true, 12), /タイムアウト/);
  rejectAck(new Error('private/object/path/candidate-1'));
  await delay(4);
});

test('stalled canonical readback is unknown, not an optimistic heart', async () => {
  let finish;
  const read = new Promise((resolve) => { finish = resolve; });
  let sent = 0;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', true,
    async () => { sent++; }, () => read, () => true, 12), /タイムアウト/);
  finish(['job-1']);
  await delay(4);
  assert.equal(sent, 1);
});

test('a revoked session during canonical readback cannot publish a heart', async () => {
  let current = true;
  await assert.rejects(confirmSavedJobMutationWithinDeadline('job-1', true,
    mutate, async () => { current = false; return ['job-1']; }, () => current, 100), /安全なログイン状態/);
});
