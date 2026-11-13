import test from 'node:test';
import assert from 'node:assert/strict';
import { requireCurrentPendingScout } from '../src/lib/scoutDecisionPrewrite.ts';

const id = 'e43c6d35-00b8-44bc-b9be-169768291100';
const second = '6fe12a0b-d89e-4b20-b767-cf330f98a09b';
const now = Date.parse('2026-11-13T00:00:00.000Z');
const shown = Object.freeze({
  scout_id: id, scout_status: 'pending', organization_name: 'テスト法人A',
  facility_name: 'テスト園A', job_id: second, job_title: '保育士',
  employment_type: '正社員', invitation_message: '見学から歓迎',
  sent_at: '2026-11-12T00:00:00.000Z', expires_at: '2026-11-14T00:00:00.000Z',
});
const fresh = (delta = {}) => ({ ...shown, ...delta });

test('exact candidate-authorized unchanged pending offer may proceed', () => {
  const candidate = fresh();
  assert.equal(requireCurrentPendingScout([candidate], shown, now), candidate);
});
test('changed scout status (including cancelled or already accepted) blocks prewrite', () => {
  for (const status of ['accepted', 'declined', 'cancelled', 'expired']) {
    assert.throws(() => requireCurrentPendingScout([fresh({scout_status:status})], shown, now), /回答状態/);
  }
});
test('missing, different or duplicated identity blocks response', () => {
  assert.throws(() => requireCurrentPendingScout([], shown, now), /回答状態/);
  assert.throws(() => requireCurrentPendingScout([fresh({scout_id:second})], shown, now), /回答状態/);
  assert.throws(() => requireCurrentPendingScout([fresh(), fresh()], shown, now), /回答状態/);
});
test('changed recruiter or nursery blocks disclosure based on stale consent', () => {
  for (const field of ['organization_name', 'facility_name']) {
    assert.throws(() => requireCurrentPendingScout([fresh({[field]:'別の法人・園'})], shown, now), /更新されました/);
  }
});
test('changed job or invitation text requires candidate re-confirmation', () => {
  for (const field of ['job_id', 'job_title', 'employment_type','invitation_message', 'sent_at', 'expires_at']) {
    assert.throws(() => requireCurrentPendingScout([fresh({[field]: '変更'})], shown, now), /更新されました/);
  }
});
test('expired exact offer is blocked without trying a mutation', () => {
  assert.throws(() => requireCurrentPendingScout([fresh()], shown, Date.parse(shown.expires_at)), /期限/);
  assert.throws(() => requireCurrentPendingScout([fresh()], shown, Date.parse(shown.expires_at)+1), /期限/);
});
test('invalid canonical expiry or invalid local clock fail closed', () => {
  const bad = fresh({expires_at:'not-a-date'});
  assert.throws(() => requireCurrentPendingScout([bad], bad, now), /期限/);
  assert.throws(() => requireCurrentPendingScout([fresh()], shown, NaN), /期限/);
});
test('prewrite check does not mutate a provided canonical row or displayed offer', () => {
  const item = Object.freeze(fresh());
  const rows = Object.freeze([item]);
  requireCurrentPendingScout(rows, shown, now);
  assert.deepEqual(item, shown);
});
test('UTC-invariant expiry check, without fabricated server response or role', () => {
  assert.equal(requireCurrentPendingScout([fresh()], shown, Date.parse('2026-11-13T23:59:59Z')).scout_id, id);
});
