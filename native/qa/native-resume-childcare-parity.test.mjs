import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESUME_CLASSROOM_OPTIONS, RESUME_LEADERSHIP_OPTIONS, RESUME_LINKED_AUTOSAVE_DELAY_MS,
  parseResumeExperienceYears, toggleResumeExperienceChoice, canAutosaveResumeLinkedData,
} from '../src/lib/resumeChildcarePolicy.ts';

test('Web half-year precision, blank and boundary values', () => {
  assert.equal(parseResumeExperienceYears(''), null);
  assert.equal(parseResumeExperienceYears('0'), 0);
  assert.equal(parseResumeExperienceYears('0.5'), 0.5);
  assert.equal(parseResumeExperienceYears('80'), 80);
});
test('invalid, non-half-year and out-of-range experience is rejected', () => {
  for (const value of ['-1', '81', '1.2', 'abc', 'Infinity', '0x10']) {
    assert.throws(() => parseResumeExperienceYears(value));
  }
});
test('Web classroom and leadership catalogues are stable', () => {
  assert.ok(RESUME_CLASSROOM_OPTIONS.includes('障害児保育'));
  assert.ok(RESUME_LEADERSHIP_OPTIONS.includes('主任'));
  assert.equal(RESUME_CLASSROOM_OPTIONS.length, 9);
  assert.equal(RESUME_LEADERSHIP_OPTIONS.length, 6);
});
test('unknown existing values are retained during toggles', () => {
  assert.deepEqual(toggleResumeExperienceChoice(['海外幼児教育'], '0歳児'), ['海外幼児教育', '0歳児']);
  assert.deepEqual(toggleResumeExperienceChoice(['海外幼児教育', '0歳児'], '0歳児'), ['海外幼児教育']);
});
test('debounce policy matches Web but never persists without a verified owner', () => {
  assert.equal(RESUME_LINKED_AUTOSAVE_DELAY_MS, 1200);
  const ready = { ownerKey: 'a:session', loadedOwner: 'a:session', privateAllowed: true, dirty: true, saving: false, paused: false };
  assert.equal(canAutosaveResumeLinkedData(ready), true);
  assert.equal(canAutosaveResumeLinkedData({ ...ready, loadedOwner: 'b:session' }), false);
  assert.equal(canAutosaveResumeLinkedData({ ...ready, privateAllowed: false }), false);
  assert.equal(canAutosaveResumeLinkedData({ ...ready, paused: true }), false);
  assert.equal(canAutosaveResumeLinkedData({ ...ready, saving: true }), false);
  assert.equal(canAutosaveResumeLinkedData({ ...ready, dirty: false }), false);
});
