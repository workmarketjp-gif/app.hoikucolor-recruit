import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalProfileMatchesSubmission, canPresentProfileResult } from '../src/lib/profileSaveGuard.ts';

const synthetic = {
  email: 'synthetic@example.invalid', name: '保育 花子', name_kana: 'ほいく はなこ',
  phone: null, prefecture: '東京都', desired_positions: ['保育士', '保育補助'],
  desired_employment_types: ['正社員'], qualifications: ['保育士'],
  years_of_experience: 5, desired_start_date: null, self_intro: '合成データ',
};

test('successful canonical re-read matches all editable fields, independent of array order', () => {
  assert.equal(canonicalProfileMatchesSubmission(synthetic, {
    ...synthetic, desired_positions: ['保育補助', '保育士'],
  }), true);
});
test('missing readback is never accepted as a successful save', () => {
  assert.equal(canonicalProfileMatchesSubmission(synthetic, null), false);
});
test('a stale salary/experience readback is not an acknowledged profile save', () => {
  assert.equal(canonicalProfileMatchesSubmission(synthetic, {...synthetic, years_of_experience: 4}), false);
});
test('canonical text mismatch is not a successful save', () => {
  assert.equal(canonicalProfileMatchesSubmission(synthetic, {...synthetic, email:'other@example.invalid'}), false);
});
test('a mismatched qualification set is not a successful save', () => {
  assert.equal(canonicalProfileMatchesSubmission(synthetic, {...synthetic, qualifications: []}), false);
});
test('an unrecognized extra canonical preference requires a fresh check', () => {
  assert.equal(canonicalProfileMatchesSubmission(synthetic, {...synthetic, desired_employment_types:['正社員','パート']}), false);
});
test('a changed owner cannot receive a stale profile', () => {
  assert.equal(canPresentProfileResult('A', 'B', 7, 7, true), false);
});
test('a changed request generation cannot receive a stale profile', () => {
  assert.equal(canPresentProfileResult('A', 'A', 7, 8, true), false);
});
test('private shield prevents a stale profile', () => {
  assert.equal(canPresentProfileResult('A', 'A', 7, 7, false), false);
});
test('only an exact live owner/generation with private access can present profile', () => {
  assert.equal(canPresentProfileResult('A', 'A', 7, 7, true), true);
  assert.equal(canPresentProfileResult(null, null, 7, 7, true), false);
});
