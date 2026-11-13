import assert from 'node:assert/strict';
import test from 'node:test';
import { scoutRefreshTarget } from '../src/lib/scoutRefreshIntent.ts';

const verified = {
  scoutsVerified: true,
  privacyVerified: true,
  preferencesVerified: true,
};

test('all three sections verified: refresh only the inbox to preserve unsaved preferences', () => {
  assert.equal(scoutRefreshTarget(verified), 'scout-inbox');
});

test('scouts verified, privacy missing: retry missing panel rather than just inbox', () => {
  assert.equal(scoutRefreshTarget({ ...verified, privacyVerified: false }), 'missing-sections');
});

test('scouts verified, preferences missing: retry preferences rather than just inbox', () => {
  assert.equal(scoutRefreshTarget({ ...verified, preferencesVerified: false }), 'missing-sections');
});

test('scouts missing but privacy and preferences verified: preserve edited preferences', () => {
  assert.equal(scoutRefreshTarget({ ...verified, scoutsVerified: false }), 'missing-sections');
});

test('all three missing remains in recovery rather than showing zero scouts', () => {
  assert.equal(scoutRefreshTarget({ scoutsVerified: false, privacyVerified: false, preferencesVerified: false }), 'missing-sections');
});

test('refresh intent is deterministic and does not mutate canonical section flags', () => {
  const input = Object.freeze({ ...verified, privacyVerified: false });
  assert.equal(scoutRefreshTarget(input), 'missing-sections');
  assert.equal(input.privacyVerified, false);
});
