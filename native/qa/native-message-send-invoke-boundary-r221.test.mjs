import test from 'node:test';
import assert from 'node:assert/strict';
import { sendCandidateMessageWithSessionLease } from '../src/lib/messageSendSessionLease.ts';

function setup() {
  const calls = [];
  let current = true;
  const options = {
    isCurrent: () => current,
    prepare: async () => { calls.push('prepare'); return { id: 'synthetic-request' }; },
    onInvokeStarted: () => calls.push('invoke-start'),
    invoke: async () => { calls.push('invoke'); return 'synthetic-receipt'; },
    read: async () => { calls.push('read'); return ['synthetic-receipt']; },
    confirm: (rows, receipt) => rows.includes(receipt) ? receipt : null,
    clear: async () => { calls.push('clear'); },
  };
  return { options, calls, revoke: () => { current = false; } };
}

test('successful message crosses boundary once, before invoking RPC', async () => {
  const s = setup();
  assert.equal(await sendCandidateMessageWithSessionLease(s.options), 'synthetic-receipt');
  assert.deepEqual(s.calls, ['prepare', 'invoke-start', 'invoke', 'read', 'clear']);
});
test('failed SecureStore preparation never signals possible server send', async () => {
  const s = setup();
  s.options.prepare = async () => { s.calls.push('prepare'); throw new Error('SECURE_STORE_UNAVAILABLE'); };
  await assert.rejects(sendCandidateMessageWithSessionLease(s.options), /SECURE_STORE_UNAVAILABLE/);
  assert.deepEqual(s.calls, ['prepare']);
});
test('session revoked during SecureStore preparation never invokes or signals write', async () => {
  const s = setup();
  s.options.prepare = async () => { s.calls.push('prepare'); s.revoke(); return { id: 'synthetic-request' }; };
  await assert.rejects(sendCandidateMessageWithSessionLease(s.options), /認証状態が変わりました/);
  assert.deepEqual(s.calls, ['prepare']);
});
test('already invalid session never prepares or sends', async () => {
  const s = setup(); s.revoke();
  await assert.rejects(sendCandidateMessageWithSessionLease(s.options), /認証状態が変わりました/);
  assert.deepEqual(s.calls, []);
});
test('RPC transport exception is conservatively flagged as potentially committed', async () => {
  const s = setup();
  s.options.invoke = async () => { s.calls.push('invoke'); throw new Error('response lost'); };
  await assert.rejects(sendCandidateMessageWithSessionLease(s.options), /response lost/);
  assert.deepEqual(s.calls, ['prepare', 'invoke-start', 'invoke']);
});
test('readback failure after invoke never clears durable receipt', async () => {
  const s = setup();
  s.options.read = async () => { s.calls.push('read'); throw new Error('read timeout'); };
  await assert.rejects(sendCandidateMessageWithSessionLease(s.options), /read timeout/);
  assert.deepEqual(s.calls, ['prepare', 'invoke-start', 'invoke', 'read']);
});
test('callback remains optional for existing callers', async () => {
  const s = setup(); delete s.options.onInvokeStarted;
  assert.equal(await sendCandidateMessageWithSessionLease(s.options), 'synthetic-receipt');
  assert.deepEqual(s.calls, ['prepare', 'invoke', 'read', 'clear']);
});
