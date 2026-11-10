import test from 'node:test';
import assert from 'node:assert/strict';
import { sendCandidateMessageWithSessionLease as send } from '../src/lib/messageSendSessionLease.ts';

const fixture = () => {
  let current = true;
  const calls = [];
  const params = {
    isCurrent: () => current,
    prepare: async () => { calls.push('prepare'); return { requestId: 'synthetic-id' }; },
    invoke: async (prepared) => { calls.push('invoke'); assert.equal(prepared.requestId, 'synthetic-id'); return { id: 'synthetic-reply' }; },
    read: async () => { calls.push('read'); return [{ id: 'synthetic-reply', body: '応募について質問' }]; },
    confirm: (rows, receipt) => { calls.push('confirm'); return rows.find((row) => row.id === receipt.id) ?? null; },
    clear: async () => { calls.push('clear'); },
  };
  return { params, calls, revoke: () => { current = false; } };
};

test('current owner: prepare, invoke, canonical read, proof, then durable clear', async () => {
  const state = fixture();
  const reply = await send(state.params);
  assert.deepEqual(reply, { id: 'synthetic-reply', body: '応募について質問' });
  assert.deepEqual(state.calls, ['prepare', 'invoke', 'read', 'confirm', 'clear']);
});

test('expired before prepare: no receipt, RPC, read or clear', async () => {
  const state = fixture(); state.revoke();
  await assert.rejects(send(state.params), /認証状態が変わりました/);
  assert.deepEqual(state.calls, []);
});

test('session switch during durable SecureStore preparation: never invoke RPC', async () => {
  const state = fixture();
  state.params.prepare = async () => { state.calls.push('prepare'); state.revoke(); return { requestId: 'synthetic-id' }; };
  await assert.rejects(send(state.params), /認証状態が変わりました/);
  assert.deepEqual(state.calls, ['prepare']);
});

test('revoked during RPC: preserve receipt and suppress readback/clear', async () => {
  const state = fixture();
  state.params.invoke = async () => { state.calls.push('invoke'); state.revoke(); return { id: 'synthetic-reply' }; };
  await assert.rejects(send(state.params), /認証状態が変わりました/);
  assert.deepEqual(state.calls, ['prepare', 'invoke']);
});

test('revoked during canonical read: never confirm or clear', async () => {
  const state = fixture();
  state.params.read = async () => { state.calls.push('read'); state.revoke(); return [{ id: 'synthetic-reply' }]; };
  await assert.rejects(send(state.params), /認証状態が変わりました/);
  assert.deepEqual(state.calls, ['prepare', 'invoke', 'read']);
});

test('missing canonical identity never clears ambiguous receipt', async () => {
  const state = fixture();
  state.params.confirm = () => { state.calls.push('confirm'); return null; };
  await assert.rejects(send(state.params), /送信結果を確認できませんでした/);
  assert.deepEqual(state.calls, ['prepare', 'invoke', 'read', 'confirm']);
});

test('confirmation failure never clears ambiguous receipt', async () => {
  const state = fixture();
  state.params.confirm = () => { state.calls.push('confirm'); throw new Error('invalid role'); };
  await assert.rejects(send(state.params), /invalid role/);
  assert.deepEqual(state.calls, ['prepare', 'invoke', 'read', 'confirm']);
});

test('session changes in confirmation callback: no clear', async () => {
  const state = fixture();
  state.params.confirm = (rows) => { state.calls.push('confirm'); state.revoke(); return rows[0]; };
  await assert.rejects(send(state.params), /認証状態が変わりました/);
  assert.deepEqual(state.calls, ['prepare', 'invoke', 'read', 'confirm']);
});

test('failed durable receipt clear must fail, not claim a verified success', async () => {
  const state = fixture();
  state.params.clear = async () => { state.calls.push('clear'); throw new Error('storage failure'); };
  await assert.rejects(send(state.params), /storage failure/);
  assert.deepEqual(state.calls, ['prepare', 'invoke', 'read', 'confirm', 'clear']);
});

test('session changes during receipt clear: suppress success', async () => {
  const state = fixture();
  state.params.clear = async () => { state.calls.push('clear'); state.revoke(); };
  await assert.rejects(send(state.params), /認証状態が変わりました/);
  assert.deepEqual(state.calls, ['prepare', 'invoke', 'read', 'confirm', 'clear']);
});
