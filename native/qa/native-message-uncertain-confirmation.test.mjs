import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedUncertainCandidateMessage } from '../src/lib/messageComposerRecovery.ts';

const existing = { id: 'prior-1', sender_role: 'jobseeker', body: '見学の日程を確認したいです。' };
const fresh = { id: 'new-2', sender_role: 'jobseeker', body: existing.body };

test('canonical newly appeared candidate reply confirms ambiguous send', () => {
  assert.equal(confirmedUncertainCandidateMessage(existing.body, [existing.id], [existing, fresh]), true);
});
test('older identical message is not mistaken for the unconfirmed send', () => {
  assert.equal(confirmedUncertainCandidateMessage(existing.body, [existing.id], [existing]), false);
});
test('a matching facility reply cannot confirm a candidate send', () => {
  assert.equal(confirmedUncertainCandidateMessage(existing.body, [], [{ ...fresh, sender_role: 'facility' }]), false);
});
test('unrelated candidate reply cannot confirm a different attempted body', () => {
  assert.equal(confirmedUncertainCandidateMessage(existing.body, [], [{ ...fresh, body: '別件です。' }]), false);
});
test('the submitted trim is applied, not an approximate text match', () => {
  assert.equal(confirmedUncertainCandidateMessage(`  ${existing.body}  `, [], [fresh]), true);
  assert.equal(confirmedUncertainCandidateMessage('  ', [], [fresh]), false);
});
test('a missing or previously known ID is never proof of delivery', () => {
  assert.equal(confirmedUncertainCandidateMessage(existing.body, [], [{ ...fresh, id: '' }]), false);
  assert.equal(confirmedUncertainCandidateMessage(existing.body, [fresh.id], [fresh]), false);
});
