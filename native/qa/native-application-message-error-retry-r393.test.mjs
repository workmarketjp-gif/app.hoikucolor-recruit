import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canApplyFocusedCandidateMessageRefresh,
  canRefreshFocusedCandidateMessages,
} from '../src/lib/focusedCandidateMessageRefresh.ts';

const ready = Object.freeze({
  focused: true,
  foreground: true,
  initialLoadComplete: true,
  mutationRevisionCurrent: true,
  mutationPending: false,
  sendNeedsReview: false,
});

test('a failed initial thread read may be retried without resetting the verified application parent', () => {
  // No verified thread rows are needed to retry: the parent authorization and
  // completed initial-load lease, not a fabricated empty thread, gate this read.
  assert.equal(canRefreshFocusedCandidateMessages(ready, false), true);
});

test('a simultaneous second retry cannot start another canonical read', () => {
  assert.equal(canRefreshFocusedCandidateMessages(ready, true), false);
});

test('leaving the application immediately revokes the message refresh', () => {
  assert.equal(canApplyFocusedCandidateMessageRefresh({ ...ready, focused: false }), false);
});

test('background or App Lock cannot refresh a private message thread', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...ready, foreground: false }, false), false);
});

test('a pending initial parent read is not a usable verified authorization', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...ready, initialLoadComplete: false }, false), false);
});

test('in-flight send or offer decision prevents a competing read', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...ready, mutationPending: true }, false), false);
});

test('uncertain message delivery remains under explicit review, never cleared by an automatic retry', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...ready, sendNeedsReview: true }, false), false);
});

test('session change or intervening mutation forbids publication of the late read', () => {
  assert.equal(canApplyFocusedCandidateMessageRefresh({ ...ready, mutationRevisionCurrent: false }), false);
});

test('all refresh eligibility inputs remain fail-closed', () => {
  for (const prop of ['focused', 'foreground', 'initialLoadComplete', 'mutationRevisionCurrent']) {
    assert.equal(canRefreshFocusedCandidateMessages({ ...ready, [prop]: false }, false), false);
  }
  for (const prop of ['mutationPending', 'sendNeedsReview']) {
    assert.equal(canRefreshFocusedCandidateMessages({ ...ready, [prop]: true }, false), false);
  }
});
