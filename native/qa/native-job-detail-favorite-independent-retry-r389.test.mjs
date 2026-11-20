import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartJobDetailFavoriteRetry } from '../src/lib/jobDetailFavoriteRetryGate.ts';
const state = {
  hasOwner: true, focused: true, jobVerified: true, pageLoading: false,
  savedIdsUnknown: true, readErrorPresent: true, mutationPending: false, retryPending: false,
};
test('a verified job remains open while only canonical favorites are retried', () => {
  assert.equal(canStartJobDetailFavoriteRetry(state), true);
});
test('missing owner, blurred screen or unknown job disallows private retry', () => {
  for (const patch of [{ hasOwner: false }, { focused: false }, { jobVerified: false }]) {
    assert.equal(canStartJobDetailFavoriteRetry({ ...state, ...patch }), false);
  }
});
test('initial page read has precedence over independent saved retry', () => {
  assert.equal(canStartJobDetailFavoriteRetry({ ...state, pageLoading: true }), false);
});
test('confirmed saved state and absent read error must not trigger redundant canonical call', () => {
  assert.equal(canStartJobDetailFavoriteRetry({ ...state, savedIdsUnknown: false }), false);
  assert.equal(canStartJobDetailFavoriteRetry({ ...state, readErrorPresent: false }), false);
});
test('in-progress saved mutation blocks competing recovery read', () => {
  assert.equal(canStartJobDetailFavoriteRetry({ ...state, mutationPending: true }), false);
});
test('two rapid retry taps start at most one canonical saved-ID read', () => {
  assert.equal(canStartJobDetailFavoriteRetry({ ...state, retryPending: true }), false);
});
test('after uncertain retry failure, a user-initiated retry is allowed', () => {
  assert.equal(canStartJobDetailFavoriteRetry({ ...state, retryPending: false }), true);
});
