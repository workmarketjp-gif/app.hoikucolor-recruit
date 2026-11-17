import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitApplicationDocumentAttachmentAck } from '../src/lib/awaitApplicationDocumentAttachmentAck.ts';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const sleep = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

test('r321: a confirmed attachment acknowledgement is returned once with a current lease', async () => {
  let calls = 0;
  const result = await awaitApplicationDocumentAttachmentAck(async (canContinue) => {
    calls++; assert.equal(canContinue(), true); return { id: 'synthetic-attached' };
  }, () => true, 40);
  assert.equal(calls, 1);
  assert.equal(result.id, 'synthetic-attached');
});

test('r321: revoked screen at call entry never invokes attachment', async () => {
  let calls = 0;
  await assert.rejects(awaitApplicationDocumentAttachmentAck(async () => { calls++; }, () => false, 40), /操作画面/);
  assert.equal(calls, 0);
});

test('r321: a screen revoked between entry and microtask cannot invoke attachment', async () => {
  let current = true; let calls = 0;
  const pending = awaitApplicationDocumentAttachmentAck(async () => { calls++; }, () => current, 40);
  current = false;
  await assert.rejects(pending, /操作画面/);
  assert.equal(calls, 0);
});

test('r321: pending attachment acknowledgement times out, is not retried, and is fenced', async () => {
  const response = deferred(); let calls = 0; let lease;
  const pending = awaitApplicationDocumentAttachmentAck(async (canContinue) => {
    calls++; lease = canContinue; return response.promise;
  }, () => true, 9);
  await assert.rejects(pending, /提出結果を確認できません/);
  assert.equal(calls, 1);
  assert.equal(lease(), false);
  response.resolve({ id: 'synthetic-late-commit' });
  await sleep();
  assert.equal(calls, 1);
});

test('r321: late rejection after deadline is consumed without rethrow or second write', async () => {
  const response = deferred(); let calls = 0;
  const pending = awaitApplicationDocumentAttachmentAck(async () => { calls++; return response.promise; }, () => true, 8);
  await assert.rejects(pending, /提出結果を確認できません/);
  response.reject(new Error('synthetic path or token must not appear in UI'));
  await sleep();
  assert.equal(calls, 1);
});

test('r321: token/account switch during in-flight acknowledgement cannot publish success', async () => {
  const response = deferred(); let current = true;
  const pending = awaitApplicationDocumentAttachmentAck(() => response.promise, () => current, 50);
  await sleep(1); current = false; response.resolve({ id: 'synthetic-commit' });
  await assert.rejects(pending, /操作画面/);
});

test('r321: adapter stages can check lease after preflight and avoid a late register RPC', async () => {
  const preflight = deferred(); let registerCount = 0;
  const pending = awaitApplicationDocumentAttachmentAck(async (canContinue) => {
    await preflight.promise;
    if (!canContinue()) throw new Error('expired');
    registerCount++;
  }, () => true, 9);
  await assert.rejects(pending, /提出結果を確認できません/);
  preflight.resolve();
  await sleep();
  assert.equal(registerCount, 0);
});

test('r321: rejection from invoked adapter is observed without a hidden retry', async () => {
  let calls = 0;
  await assert.rejects(awaitApplicationDocumentAttachmentAck(async () => {
    calls++; throw new Error('synthetic RPC rejection');
  }, () => true, 40), /synthetic RPC rejection/);
  assert.equal(calls, 1);
});
