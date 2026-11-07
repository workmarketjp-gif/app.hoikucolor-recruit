import test from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitCandidateMessage, shouldReviewCandidateMessageAfterFailure } from '../src/lib/messageComposerRecovery.ts';

const ready = { draft: '園への確認をお願いします。', busy: false, pending: false, needsReview: false };

test('normal Japanese candidate reply can be submitted', () => {
  assert.equal(canSubmitCandidateMessage(ready), true);
});

test('empty and whitespace-only messages do not submit', () => {
  for (const draft of ['', '  \n\t  ', '\u3000']) {
    assert.equal(canSubmitCandidateMessage({ ...ready, draft }), false);
  }
});

test('busy, in-flight, and ambiguous submission each block another write', () => {
  for (const flag of ['busy', 'pending', 'needsReview']) {
    assert.equal(canSubmitCandidateMessage({ ...ready, [flag]: true }), false);
  }
});

test('only a started durable RPC requires canonical review after failure', () => {
  assert.equal(shouldReviewCandidateMessageAfterFailure(false), false);
  assert.equal(shouldReviewCandidateMessageAfterFailure(true), true);
});

test('canonical read failure does not release a blocked composer; confirmed read can', () => {
  const uncertain = { ...ready, needsReview: true };
  assert.equal(canSubmitCandidateMessage(uncertain), false);
  // Only the screen's successful canonical load may transition to this state.
  assert.equal(canSubmitCandidateMessage({ ...uncertain, needsReview: false }), true);
});
