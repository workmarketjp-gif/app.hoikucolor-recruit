import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canRefreshFocusedCandidateMessages,
  canApplyFocusedCandidateMessageRefresh,
} from '../src/lib/focusedCandidateMessageRefresh.ts';

const safe = Object.freeze({
  focused: true, foreground: true, initialLoadComplete: true,
  mutationRevisionCurrent: true, mutationPending: false, sendNeedsReview: false,
});

test('r323: a focused and verified application thread can be refreshed without another detail load', () => {
  assert.equal(canRefreshFocusedCandidateMessages(safe, false), true);
  assert.equal(canApplyFocusedCandidateMessageRefresh(safe), true);
});
test('r323: synchronous pending-read lease rejects a duplicate manual tap', () => {
  assert.equal(canRefreshFocusedCandidateMessages(safe, true), false);
});
test('r323: an initial canonical load cannot be interrupted by manual refresh', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...safe, initialLoadComplete: false }, false), false);
});
test('r323: an unfocused or backgrounded private thread cannot be read', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...safe, focused: false }, false), false);
  assert.equal(canRefreshFocusedCandidateMessages({ ...safe, foreground: false }, false), false);
});
test('r323: a candidate send/decision blocks refresh and its result', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...safe, mutationPending: true }, false), false);
  assert.equal(canApplyFocusedCandidateMessageRefresh({ ...safe, mutationPending: true }), false);
});
test('r323: an ambiguous send must use canonical send review, not ordinary refresh', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...safe, sendNeedsReview: true }, false), false);
});
test('r323: an old response cannot overwrite messages after a write revision', () => {
  assert.equal(canApplyFocusedCandidateMessageRefresh({ ...safe, mutationRevisionCurrent: false }), false);
});
test('r323: a previous read failure is not equivalent to an unauthorized owner', () => {
  // The gate deliberately has no messagesReadError flag. A manual canonical
  // re-read may recover a failed read, but never bypasses owner/focus checks.
  assert.equal(canRefreshFocusedCandidateMessages(safe, false), true);
  assert.equal(canRefreshFocusedCandidateMessages({ ...safe, focused: false }, false), false);
});
