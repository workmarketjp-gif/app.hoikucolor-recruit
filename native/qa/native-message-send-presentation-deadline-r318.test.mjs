import test from 'node:test';
import assert from 'node:assert/strict';
import { sendCandidateMessageWithinPresentationDeadline } from '../src/lib/candidateMessagePresentationDeadline.ts';
import { sendCandidateMessageWithSessionLease } from '../src/lib/messageSendSessionLease.ts';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const sleep = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function setup({ prepare, invoke, read, clear, current = () => true, timeoutMs = 40 } = {}) {
  const calls = [];
  let invoked = false;
  const run = () => sendCandidateMessageWithinPresentationDeadline(
    (lease) => sendCandidateMessageWithSessionLease({
      isCurrent: () => current() && lease(),
      prepare: async () => { calls.push('prepare'); return prepare ? prepare() : 'request-id'; },
      onInvokeStarted: () => { invoked = true; calls.push('invoke-started'); },
      invoke: async (prepared) => { calls.push('invoke'); return invoke ? invoke(prepared) : 'receipt-id'; },
      read: async () => { calls.push('read'); return read ? read() : [{ id: 'receipt-id', body: 'synthetic' }]; },
      confirm: (rows, id) => rows.find((row) => row.id === id) ?? null,
      clear: async () => { calls.push('clear'); await clear?.(); },
    }), current, timeoutMs,
  );
  return { run, calls, wasInvoked: () => invoked };
}

test('confirmed send is one RPC, canonical read and durable-clear, in order', async () => {
  const task = setup();
  const value = await task.run();
  assert.deepEqual(value, { id: 'receipt-id', body: 'synthetic' });
  assert.deepEqual(task.calls, ['prepare', 'invoke-started', 'invoke', 'read', 'clear']);
});

test('a stalled SecureStore preparation times out without starting any RPC later', async () => {
  const prep = deferred();
  const task = setup({ prepare: () => prep.promise, timeoutMs: 12 });
  await assert.rejects(task.run(), /タイムアウト/);
  prep.resolve('late-request-id');
  await sleep();
  assert.deepEqual(task.calls, ['prepare']);
  assert.equal(task.wasInvoked(), false);
});

test('a stalled RPC is invoked just once; late ACK cannot initiate a canonical read or clear', async () => {
  const ack = deferred();
  const task = setup({ invoke: () => ack.promise, timeoutMs: 12 });
  await assert.rejects(task.run(), /タイムアウト/);
  ack.resolve('receipt-id');
  await sleep();
  assert.deepEqual(task.calls, ['prepare', 'invoke-started', 'invoke']);
  assert.equal(task.wasInvoked(), true);
});

test('a late RPC rejection is observed and never falsely reported as delivery', async () => {
  const ack = deferred();
  const task = setup({ invoke: () => ack.promise, timeoutMs: 12 });
  await assert.rejects(task.run(), /タイムアウト/);
  ack.reject(new Error('synthetic network failure'));
  await sleep();
  assert.equal(task.calls.includes('read'), false);
});

test('stalled canonical confirmation times out without clearing the durable receipt', async () => {
  const read = deferred();
  const task = setup({ read: () => read.promise, timeoutMs: 12 });
  await assert.rejects(task.run(), /タイムアウト/);
  read.resolve([{ id: 'receipt-id', body: 'synthetic' }]);
  await sleep();
  assert.deepEqual(task.calls, ['prepare', 'invoke-started', 'invoke', 'read']);
});

test('revoked owner or App Lock during SecureStore prevents RPC invocation', async () => {
  const prep = deferred();
  let authorized = true;
  const task = setup({ prepare: () => prep.promise, current: () => authorized });
  const pending = task.run();
  await sleep(2);
  authorized = false;
  prep.resolve('late-request');
  await assert.rejects(pending, /認証状態/);
  assert.equal(task.wasInvoked(), false);
});

test('owner switch after an RPC acknowledgement fences subsequent private reads', async () => {
  let authorized = true;
  const task = setup({ invoke: async () => { authorized = false; return 'receipt-id'; }, current: () => authorized });
  await assert.rejects(task.run(), /認証状態/);
  assert.equal(task.calls.includes('read'), false);
  assert.equal(task.wasInvoked(), true);
});

test('failed prewrite preparation never claims an RPC was invoked', async () => {
  const task = setup({ prepare: async () => { throw new Error('synthetic storage failure'); } });
  await assert.rejects(task.run(), /storage failure/);
  assert.deepEqual(task.calls, ['prepare']);
});

test('server-rejected RPC is never retried and no canonical read follows', async () => {
  const task = setup({ invoke: async () => { throw new Error('synthetic RLS denial'); } });
  await assert.rejects(task.run(), /RLS denial/);
  assert.deepEqual(task.calls, ['prepare', 'invoke-started', 'invoke']);
});

test('a second pre-start identity failure cannot start a delayed RPC', async () => {
  let authorized = true;
  const task = setup({ current: () => authorized, prepare: async () => { authorized = false; return 'prepared'; } });
  await assert.rejects(task.run(), /認証状態/);
  assert.equal(task.wasInvoked(), false);
});
