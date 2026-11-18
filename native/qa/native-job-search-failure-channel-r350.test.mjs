import test from 'node:test';
import assert from 'node:assert/strict';
import { jobSearchFailureChannel } from '../src/lib/jobSearchFailureChannel.ts';

const defaultOptions = {
  reset: false,
  owner: 'synthetic-candidate-A/session-1',
  requestedOwner: 'synthetic-candidate-A/session-1',
  requestGeneration: 7,
  currentGeneration: 7,
  privateAllowed: true,
  hasConfirmedResults: true,
  hasConfirmedBookmarks: false,
};

test('r349: a failed next job page remains pagination even while bookmark read is UNKNOWN', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, bookmarksOptional: true }), 'pagination');
});
test('compatibility: callers without explicit independent bookmarks retain legacy gate', () => {
  assert.equal(jobSearchFailureChannel(defaultOptions), 'initial');
});
test('normally confirmed bookmark and page behave as pagination', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, hasConfirmedBookmarks: true }), 'pagination');
});
test('first search is initial even when bookmark failures are independent', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, reset: true, bookmarksOptional: true }), 'initial');
});
test('cannot claim pagination when job rows themselves have never been verified', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, hasConfirmedResults: false, bookmarksOptional: true }), 'initial');
});
test('rejects account switches even if rows were previously verified', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, requestedOwner: 'synthetic-candidate-B/session-2', bookmarksOptional: true }), null);
});
test('rejects expired/stale generations', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, currentGeneration: 8, bookmarksOptional: true }), null);
});
test('rejects shielded/private-disallowed results', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, privateAllowed: false, bookmarksOptional: true }), null);
});
test('rejects absent owner', () => {
  assert.equal(jobSearchFailureChannel({ ...defaultOptions, owner: null, bookmarksOptional: true }), null);
});
