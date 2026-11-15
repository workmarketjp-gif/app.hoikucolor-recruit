import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptCandidateOfferWithFreshReadback } from '../src/lib/applicationOfferAcceptance.ts';

const presented = Object.freeze({ id: 'application-A', status: 'offered', candidate_offer_response: null });
const detail = (override = {}) => ({ application: { ...presented, ...override }, interviews: [] });
function setup(overrides = {}) {
  const calls = [];
  const options = {
    presented,
    isCurrent: () => true,
    readCurrent: async () => { calls.push('read'); return detail(); },
    accept: async () => { calls.push('accept'); return detail({ candidate_offer_response: 'accepted' }); },
    ...overrides,
  };
  return { calls, options };
}

test('fresh accepted offer invokes canonical RPC once and returns its readback', async () => {
  const { options, calls } = setup();
  const result = await acceptCandidateOfferWithFreshReadback(options);
  assert.equal(result.kind, 'accepted');
  assert.equal(result.detail.application.candidate_offer_response, 'accepted');
  assert.deepEqual(calls, ['read', 'accept']);
});

test('facility withdrawal/rejection after rendering never invokes acceptance RPC', async () => {
  for (const status of ['withdrawn', 'rejected', 'hired', 'reviewing']) {
    const { options, calls } = setup({ readCurrent: async () => { calls.push('read'); return detail({ status }); } });
    const result = await acceptCandidateOfferWithFreshReadback(options);
    assert.deepEqual(calls, ['read'], status);
    assert.equal(result.kind, 'stale');
    assert.equal(result.detail.application.status, status);
  }
});

test('already accepted offer, different application and missing canonical detail are never sent', async () => {
  for (const value of [detail({ candidate_offer_response: 'accepted' }), detail({ id: 'application-B' }), null]) {
    const { options, calls } = setup({ readCurrent: async () => { calls.push('read'); return value; } });
    assert.equal((await acceptCandidateOfferWithFreshReadback(options)).kind, 'stale');
    assert.deepEqual(calls, ['read']);
  }
});

test('revocation before reading forbids canonical reads and RPC', async () => {
  const { options, calls } = setup({ isCurrent: () => false });
  await assert.rejects(acceptCandidateOfferWithFreshReadback(options), /認証または閲覧状態/);
  assert.deepEqual(calls, []);
});

test('revocation during slow canonical read forbids acceptance', async () => {
  let current = true;
  const { options, calls } = setup({
    isCurrent: () => current,
    readCurrent: async () => { calls.push('read'); current = false; return detail(); },
  });
  await assert.rejects(acceptCandidateOfferWithFreshReadback(options), /認証または閲覧状態/);
  assert.deepEqual(calls, ['read']);
});

test('read failure or RPC failure is propagated without retries', async () => {
  const a = setup({ readCurrent: async () => { a.calls.push('read'); throw new Error('read failed'); } });
  await assert.rejects(acceptCandidateOfferWithFreshReadback(a.options), /read failed/);
  assert.deepEqual(a.calls, ['read']);
  const b = setup({ accept: async () => { b.calls.push('accept'); throw new Error('RPC uncertain'); } });
  await assert.rejects(acceptCandidateOfferWithFreshReadback(b.options), /RPC uncertain/);
  assert.deepEqual(b.calls, ['read', 'accept']);
});

test('revocation during RPC cannot publish the returned data as confirmed', async () => {
  let current = true;
  const { options, calls } = setup({ isCurrent: () => current,
    accept: async () => { calls.push('accept'); current = false; return detail({ candidate_offer_response: 'accepted' }); },
  });
  await assert.rejects(acceptCandidateOfferWithFreshReadback(options), /認証または閲覧状態/);
  assert.deepEqual(calls, ['read', 'accept']);
});
