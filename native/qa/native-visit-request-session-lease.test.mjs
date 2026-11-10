import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestCandidateVisitWithLease } from '../src/lib/visitRequestSessionLease.ts';

function makeHarness(options = {}) {
  let current = true;
  const phases = [];
  const revoke = () => { current = false; };
  const act = async (name, result) => {
    phases.push(name);
    if (options.revokeAt === name) revoke();
    if (options.failAt === name) throw new Error('network failure');
    return result;
  };
  const actions = {
    isCurrent: () => current,
    prepare: () => act('prepare', 'request-id'),
    invoke: (key) => { assert.equal(key, 'request-id'); return act('rpc', 'reservation-id'); },
    readVisits: () => act('readback', ['reservation-id']),
    confirms: (history, id) => {
      phases.push('confirm');
      if (options.revokeAt === 'confirm') revoke();
      return options.mismatch ? false : history[0] === id;
    },
    clear: () => act('clear'),
  };
  return { actions, phases, revoke };
}

test('current candidate makes one request, confirms canonical state, then clears receipt', async () => {
  const h = makeHarness();
  assert.equal(await requestCandidateVisitWithLease(h.actions), 'reservation-id');
  assert.deepEqual(h.phases, ['prepare', 'rpc', 'readback', 'confirm', 'clear']);
});

test('expired session before preparation does not touch SecureStore or network', async () => {
  const h = makeHarness(); h.revoke();
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.phases, []);
});

test('session switch while waiting for durable receipt never invokes request RPC', async () => {
  const h = makeHarness({ revokeAt: 'prepare' });
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.phases, ['prepare']);
});

test('session revoked during request RPC leaves receipt and forbids further private reads', async () => {
  const h = makeHarness({ revokeAt: 'rpc' });
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.phases, ['prepare','rpc']);
});

test('session revoked during canonical readback retains unresolved receipt', async () => {
  const h = makeHarness({ revokeAt: 'readback' });
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.phases, ['prepare','rpc','readback']);
});

test('exact canonical mismatch never claims success or deletes durable receipt', async () => {
  const h = makeHarness({ mismatch: true });
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /再送信せず予約履歴/);
  assert.deepEqual(h.phases, ['prepare','rpc','readback','confirm']);
});

test('session revoked while comparing canonical readback blocks receipt clear', async () => {
  const h = makeHarness({ revokeAt: 'confirm' });
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.phases, ['prepare','rpc','readback','confirm']);
});

test('ambiguous RPC result or readback error is never auto-retried', async () => {
  for (const phase of ['rpc','readback']) {
    const h = makeHarness({ failAt: phase });
    await assert.rejects(requestCandidateVisitWithLease(h.actions), /network failure/);
    assert.equal(h.phases.filter(x => x === 'rpc').length, 1);
    assert.equal(h.phases.includes('clear'), false);
  }
});

test('failed receipt clear is reported instead of claiming submission confirmation', async () => {
  const h = makeHarness({ failAt: 'clear' });
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /network failure/);
  assert.equal(h.phases.filter(x=>x==='rpc').length, 1);
});

test('session revocation during clear prevents reporting a confirmed result', async () => {
  const h = makeHarness({ revokeAt: 'clear' });
  await assert.rejects(requestCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.equal(h.phases.filter(x=>x==='rpc').length, 1);
});
