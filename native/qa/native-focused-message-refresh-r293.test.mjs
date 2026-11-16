import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canApplyFocusedCandidateMessageRefresh,
  canRefreshFocusedCandidateMessages,
} from '../src/lib/focusedCandidateMessageRefresh.ts';

const active = {
  focused: true, foreground: true, initialLoadComplete: true, mutationRevisionCurrent: true,
  mutationPending: false, sendNeedsReview: false,
};

test('focused foreground canonical message refresh may start', () => {
  assert.equal(canRefreshFocusedCandidateMessages(active, false), true);
});

test('one read at a time prevents overlapping API polling', () => {
  assert.equal(canRefreshFocusedCandidateMessages(active, true), false);
});

test('hidden route or background OS never launches a private read', () => {
  for (const state of [{ focused: false }, { foreground: false }]) {
    assert.equal(canRefreshFocusedCandidateMessages({ ...active, ...state }, false), false);
    assert.equal(canApplyFocusedCandidateMessageRefresh({ ...active, ...state }), false);
  }
});

test('initial detail/message read has precedence over silent refresh', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...active, initialLoadComplete: false }, false), false);
});

test('in-flight application mutation prevents stale thread overwrite', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...active, mutationPending: true }, false), false);
  assert.equal(canApplyFocusedCandidateMessageRefresh({ ...active, mutationPending: true }), false);
});

test('ambiguous send cannot be unblocked by periodic read', () => {
  assert.equal(canRefreshFocusedCandidateMessages({ ...active, sendNeedsReview: true }, false), false);
  assert.equal(canApplyFocusedCandidateMessageRefresh({ ...active, sendNeedsReview: true }), false);
});

test('a started polling read is discarded after route blur or app background', () => {
  for (const changed of [{ focused: false }, { foreground: false }, { sendNeedsReview: true }]) {
    assert.equal(canApplyFocusedCandidateMessageRefresh({ ...active, ...changed }), false);
  }
});

test('a settled read may update canonical messages only in unchanged active state', () => {
  assert.equal(canApplyFocusedCandidateMessageRefresh(active), true);
});

test('poll started before a write cannot overwrite confirmed messages after write settles', () => {
  assert.equal(canApplyFocusedCandidateMessageRefresh({ ...active, mutationRevisionCurrent: false }), false);
});
