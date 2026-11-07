import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedCandidateJobDetail } from '../src/lib/candidateJobDetailReadback.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const job = (override = {}) => ({
  id: ID, facility_id: OTHER, facility_name: '合成ひまわり保育園',
  title: '合成求人', description: '園の保育方針', salary_note: '既存の記載を保持',
  ...override,
});

test('a genuine empty canonical SETOF result remains a not-found result', () => {
  assert.equal(verifiedCandidateJobDetail([], ID), null);
});

test('a valid authorized job detail is the exact original server object, without inventing facts', () => {
  const actual = job();
  assert.equal(verifiedCandidateJobDetail([actual], ID), actual);
  assert.equal(verifiedCandidateJobDetail([actual], ID.toUpperCase()), actual);
});

test('missing or malformed RPC envelopes are errors, never no-job messages', () => {
  for (const value of [null, undefined, {}, { id: ID }, '[]', false, 0, [null], ['bad']]) {
    assert.throws(() => verifiedCandidateJobDetail(value, ID), /求人詳細を確認できませんでした/);
  }
});

test('identity mismatches or duplicate detail rows cannot surface another job or wrong CTA', () => {
  for (const value of [[job({ id: OTHER })], [job(), job() ], [job(), job({ id: OTHER })]]) {
    assert.throws(() => verifiedCandidateJobDetail(value, ID), /求人詳細を確認できませんでした/);
  }
  assert.throws(() => verifiedCandidateJobDetail([job()], 'not-a-job-id'), /求人詳細を確認できませんでした/);
});

test('required canonical identity and user-visible title are not silently blanked', () => {
  for (const patch of [
    { id: 'bad' }, { id: null }, { facility_id: null }, { facility_id: 'bad' },
    { title: '' }, { title: null }, { title: '   ' },
    { facility_name: '' }, { facility_name: null },
  ]) {
    assert.throws(() => verifiedCandidateJobDetail([job(patch)], ID), /求人詳細を確認できませんでした/);
  }
});
