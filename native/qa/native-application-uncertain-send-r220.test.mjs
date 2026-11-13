import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitCandidateMessage, classifyUncertainCandidateMessageReview, confirmedUncertainCandidateMessage } from '../src/lib/messageComposerRecovery.ts';

const pending = { submittedDraft: '本日はありがとうございます。', knownMessageIds: ['prior-1'] };
const msg = (id, sender_role = 'jobseeker', body = pending.submittedDraft) => ({ id, sender_role, body });
const composer = { draft: pending.submittedDraft, busy: false, pending: false, needsReview: true };

for (const [name, messages] of [
  ['canonical empty thread', []],
  ['only prior identical-body message', [msg('prior-1')]],
  ['new facility message', [msg('new-1', 'facility')]],
  ['new candidate message with different text', [msg('new-1', 'jobseeker', '別の内容')]],
  ['new record without an ID', [msg('')]],
]) {
  test(`${name} remains unverified and cannot cause a duplicate send`, () => {
    const outcome = classifyUncertainCandidateMessageReview(pending, messages);
    assert.equal(outcome, 'unverified');
    assert.equal(canSubmitCandidateMessage({ ...composer, needsReview: outcome === 'unverified' }), false);
  });
}

test('new exact candidate reply is positive evidence for clearing review', () => {
  const messages = [msg('prior-1'), msg('new-2')];
  assert.equal(confirmedUncertainCandidateMessage(pending.submittedDraft, pending.knownMessageIds, messages), true);
  const outcome = classifyUncertainCandidateMessageReview(pending, messages);
  assert.equal(outcome, 'confirmed');
  assert.equal(canSubmitCandidateMessage({ ...composer, needsReview: outcome === 'unverified' }), true);
});

test('no pending send remains a normal authorized canonical refresh', () => {
  assert.equal(classifyUncertainCandidateMessageReview(null, []), 'none');
});

test('empty pending draft cannot be falsely confirmed', () => {
  assert.equal(classifyUncertainCandidateMessageReview({ submittedDraft: '  ', knownMessageIds: [] }, [msg('new-2', 'jobseeker', '')]), 'unverified');
});
