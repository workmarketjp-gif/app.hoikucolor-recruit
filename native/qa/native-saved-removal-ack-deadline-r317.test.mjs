import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSavedJobRemovalWithinDeadline } from '../src/lib/savedJobMutationDeadline.ts';

const pause = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

test('saved card remove runs one RPC and only renders canonical rows after reread', async () => {
  const calls = [];
  const rows = await confirmSavedJobRemovalWithinDeadline('job-a',
    async () => { calls.push('remove'); },
    async () => { calls.push('read'); return [{ id: 'job-b', title: 'synthetic' }]; },
    () => true, 100);
  assert.deepEqual(rows, [{ id: 'job-b', title: 'synthetic' }]);
  assert.deepEqual(calls, ['remove', 'read']);
});

test('mutation ACK timeout returns unknown and delayed ACK cannot start a private read', async () => {
  let resolveAck;
  const ack = new Promise((resolve) => { resolveAck = resolve; });
  let sent = 0;
  let read = 0;
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    () => { sent += 1; return ack; },
    async () => { read += 1; return []; },
    () => true, 10), /タイムアウト/);
  resolveAck();
  await pause();
  assert.equal(sent, 1);
  assert.equal(read, 0);
});

test('canonical reread timeout does not imply removal success or resend', async () => {
  let removeCount = 0;
  let readCount = 0;
  const never = new Promise(() => {});
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    async () => { removeCount += 1; },
    () => { readCount += 1; return never; },
    () => true, 10), /タイムアウト/);
  assert.equal(removeCount, 1);
  assert.equal(readCount, 1);
});

test('revoked candidate before remove launches no mutation/read', async () => {
  let sent = 0;
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    async () => { sent += 1; }, async () => [], () => false, 100),
  /安全なログイン状態/);
  assert.equal(sent, 0);
});

test('revoked candidate after ACK cannot start canonical private read', async () => {
  let active = true;
  let reads = 0;
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    async () => { active = false; },
    async () => { reads += 1; return []; }, () => active, 100),
  /安全なログイン状態/);
  assert.equal(reads, 0);
});

test('revoked candidate during read cannot commit rows after late success', async () => {
  let active = true;
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    async () => {}, async () => { active = false; return []; }, () => active, 100),
  /安全なログイン状態/);
});

test('still-saved canonical row rejects optimistic removal', async () => {
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    async () => {}, async () => [{ id: 'job-a' }], () => true, 100), /保存結果を確認できません/);
});

test('malformed canonical rows reject removal', async () => {
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    async () => {}, async () => [null], () => true, 100), /保存結果を確認できません/);
});

test('network error is not automatically retried', async () => {
  let sent = 0;
  let read = 0;
  await assert.rejects(confirmSavedJobRemovalWithinDeadline('job-a',
    async () => { sent += 1; throw Error('synthetic transport error'); },
    async () => { read += 1; return []; }, () => true, 100), /synthetic transport error/);
  assert.equal(sent, 1);
  assert.equal(read, 0);
});
