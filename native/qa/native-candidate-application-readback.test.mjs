import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedCandidateApplicationRows } from '../src/lib/candidateApplicationReadback.ts';

const first = {
  id: '6411d4af-86f0-4791-b710-43fdcda51c25',
  job_id: '11c82317-5e1e-4b30-9cd5-0db3628f77e1',
  applicant_name: '保育 花子', status: 'reviewing', desired_start_date: '2027-04-01',
  message: null, applied_at: '2026-11-07T01:10:00+00:00',
  updated_at: '2026-11-07T02:12:00Z', job_title: '保育士',
  employment_type: '正社員', facility_name: '合成さくら保育園', prefecture: '東京都', city: '文京区',
};
const second = {
  ...first, id: 'bd2bc450-0663-4c3b-a8c6-1e678a5dce2f',
  candidate_offer_response: 'accepted', candidate_offer_responded_at: '2026-11-07T03:00:00Z',
  candidate_offer_message: 'よろしくお願いします。',
};

test('a canonical empty SQL array is a truly empty application history', () => {
  assert.deepEqual(verifiedCandidateApplicationRows([]), []);
});
test('preserves the full canonical list, Japanese content, and optional offer state', () => {
  const rows = [first, second];
  assert.strictEqual(verifiedCandidateApplicationRows(rows), rows);
  assert.deepEqual(verifiedCandidateApplicationRows(rows).map(r => r.id), [first.id, second.id]);
});
test('missing or malformed RPC responses cannot become a false empty inbox/history', () => {
  for (const response of [null, undefined, {}, { applications: [] }, '[]', false, 0]) {
    assert.throws(() => verifiedCandidateApplicationRows(response), /応募履歴の整合性/);
  }
});
test('invalid identity, status, and timestamps fail the entire canonical read', () => {
  for (const change of [
    { id: 'bad-id' }, { job_id: 'not-uuid' }, { status: null }, { status: '' },
    { applied_at: 'invalid' }, { updated_at: null }, { job_title: undefined },
    { facility_name: null }, { applicant_name: undefined },
  ]) assert.throws(() => verifiedCandidateApplicationRows([{ ...first, ...change }]), /整合性/);
});
test('nullable SQL columns accept null but reject invalid data types', () => {
  const nulls = { ...first, desired_start_date: null, message: null, employment_type: null, prefecture: null, city: null };
  assert.deepEqual(verifiedCandidateApplicationRows([nulls]), [nulls]);
  for (const change of [{ message: {} }, { city: 12 }, { desired_start_date: '2026-02-30' }, { desired_start_date: 'tomorrow' }]) {
    assert.throws(() => verifiedCandidateApplicationRows([{ ...first, ...change }]), /整合性/);
  }
});
test('duplicate rows or malformed entries block the entire result rather than silently hiding a row', () => {
  for (const result of [[first, first], [first, null], [first, []], [first, 'bad']]) {
    assert.throws(() => verifiedCandidateApplicationRows(result), /整合性/);
  }
});
test('offer extensions reject unsupported or corrupt responses without inferring acceptance', () => {
  for (const change of [
    { candidate_offer_response: 'unconfirmed' }, { candidate_offer_responded_at: 'not-date' },
    { candidate_offer_message: { text: 'accepted' } },
  ]) assert.throws(() => verifiedCandidateApplicationRows([{ ...first, ...change }]), /整合性/);
  assert.equal(verifiedCandidateApplicationRows([{ ...first, candidate_offer_response: null }])[0].candidate_offer_response, null);
});
