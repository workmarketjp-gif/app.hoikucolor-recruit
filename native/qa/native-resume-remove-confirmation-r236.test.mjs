import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureResumeRemoval, isResumeRemovalStillCurrent } from '../src/lib/resumeEntryRemovalConfirmation.ts';

const school = { id: 'education-1', organization: 'テスト学園' };
const second = { id: 'education-2', organization: 'テスト短大' };
const rows = [school, second];
const lease = captureResumeRemoval('candidate-A/session-A', 7, 14, 0, rows);
const current = { owner: 'candidate-A/session-A', generation: 7, draftRevision: 14,
  privateAllowed: true, item: school };

test('same candidate/session, unchanged row, exact index and draft allow confirmed removal', () => {
  assert.ok(lease);
  assert.equal(isResumeRemovalStillCurrent(lease, current), true);
});
test('no owner, missing row or invalid index never opens a destructive confirmation', () => {
  assert.equal(captureResumeRemoval(null, 1, 1, 0, rows), null);
  assert.equal(captureResumeRemoval('candidate-A', 1, 1, 2, rows), null);
  assert.equal(captureResumeRemoval('candidate-A', 1, 1, -1, rows), null);
  assert.equal(captureResumeRemoval('candidate-A', 1, 1, 0.5, rows), null);
});
test('account and Clerk session switches invalidate old confirmation', () => {
  for (const owner of ['candidate-B/session-A','candidate-A/session-B',null]) {
    assert.equal(isResumeRemovalStillCurrent(lease, { ...current, owner }), false);
  }
});
test('blur, focus/reload and App Lock invalidate confirmation', () => {
  assert.equal(isResumeRemovalStillCurrent(lease, { ...current, generation: 8 }), false);
  assert.equal(isResumeRemovalStillCurrent(lease, { ...current, privateAllowed: false }), false);
});
test('a subsequent edit invalidates deletion even if the same row remains at the same index', () => {
  assert.equal(isResumeRemovalStillCurrent(lease, { ...current, draftRevision: 15 }), false);
});
test('reordered rows cannot be deleted by their previous index', () => {
  assert.equal(isResumeRemovalStillCurrent(lease, { ...current, item: second }), false);
});
test('a canonical reload with the same id but different object invalidates confirmation', () => {
  assert.equal(isResumeRemovalStillCurrent(lease, { ...current, item: { ...school } }), false);
});
test('deleted row cannot be confirmed when its index no longer exists', () => {
  assert.equal(isResumeRemovalStillCurrent(lease, { ...current, item: null }), false);
});
test('employment and education use the same conservative row lease', () => {
  const job = { id: 'work-1', organization: 'テスト保育園', duties: 'テスト業務' };
  const jobLease = captureResumeRemoval('candidate-A/session-A', 1, 4, 0, [job]);
  assert.ok(jobLease);
  assert.equal(isResumeRemovalStillCurrent(jobLease, {owner:'candidate-A/session-A', generation:1, draftRevision:4, privateAllowed:true, item:job}), true);
});
