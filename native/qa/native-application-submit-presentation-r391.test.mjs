import assert from 'node:assert/strict';
import test from 'node:test';
import { submitApplicationWithinPresentationDeadline } from '../src/lib/applicationSubmitPresentationDeadline.ts';

const never = () => new Promise(() => {});

test('successful explicit submission confirms within the lease and returns canonical result', async () => {
  let stage = 0;
  const result = await submitApplicationWithinPresentationDeadline(async (lease) => {
    assert.equal(lease(), true);
    stage++;
    return { applicationId: 'synthetic-id', documentHandoffFailures: 0 };
  }, () => true, 30);
  assert.equal(stage, 1);
  assert.deepEqual(result, { applicationId: 'synthetic-id', documentHandoffFailures: 0 });
});

test('timeout ends UI wait and expires the post-RPC lease, without redispatch', async () => {
  let dispatches = 0, delayedRead = 0, resolveAck;
  const pending = new Promise(resolve => { resolveAck = resolve; });
  const result = submitApplicationWithinPresentationDeadline(async (lease) => {
    dispatches++;
    await pending;
    if (lease()) delayedRead++;
    return 'ack';
  }, () => true, 10);
  await assert.rejects(result, /タイムアウト/);
  resolveAck('server-committed');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(dispatches, 1);
  assert.equal(delayedRead, 0, 'late ack must not authorize new reads or uploads');
});

test('hung RPC never traps applying UI, even if it never settles', async () => {
  let dispatches = 0;
  await assert.rejects(submitApplicationWithinPresentationDeadline(() => {
    dispatches++;
    return never();
  }, () => true, 8), /タイムアウト/);
  assert.equal(dispatches, 1);
});

test('session lost before dispatch prevents invoking the submit callback', async () => {
  let dispatches = 0;
  await assert.rejects(submitApplicationWithinPresentationDeadline(() => {
    dispatches++;
    return Promise.resolve('result');
  }, () => false, 8), /ログイン状態/);
  assert.equal(dispatches, 0);
});

test('Clerk revocation while RPC is pending prohibits later stages', async () => {
  let current = true, resolveAck, started = 0, reads = 0;
  const ack = new Promise(resolve => { resolveAck = resolve; });
  const run = submitApplicationWithinPresentationDeadline(async (lease) => {
    started++;
    await ack;
    if (lease()) reads++;
    return 'ack';
  }, () => current, 100);
  await new Promise(resolve => setImmediate(resolve));
  current = false;
  resolveAck();
  await assert.rejects(run, /ログイン状態/);
  assert.equal(started, 1);
  assert.equal(reads, 0);
});

test('late rejection from original RPC is observed after timeout', async () => {
  let rejectAck;
  const pending = new Promise((resolve, reject) => { rejectAck = reject; });
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await assert.rejects(submitApplicationWithinPresentationDeadline(() => pending, () => true, 8), /タイムアウト/);
    rejectAck(new Error('synthetic-late-rpc-failure'));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('late preparation promise cannot start submission after its lease expires', async () => {
  let proceed, submitted = 0;
  const ready = new Promise(resolve => { proceed = resolve; });
  const p = submitApplicationWithinPresentationDeadline(async lease => {
    await ready;
    if (lease()) submitted++;
    return 'not-dispatched';
  }, () => true, 8);
  await assert.rejects(p, /タイムアウト/);
  proceed();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(submitted, 0);
});
