import test from 'node:test';
import assert from 'node:assert/strict';
import { canOpenVerifiedApplicationList } from '../src/lib/applicationVerifiedNavigationPolicy.ts';

const confirmed = {
  listPresent: true,
  expectedOwnerKey: '["candidate-A","session-1"]',
  freshlyVerifiedOwnerKey: '["candidate-A","session-1"]',
  privateAllowed: true,
  readPending: false,
  readFailed: false,
};

test('current-session canonically verified application index permits its existing row navigation', () => {
  assert.equal(canOpenVerifiedApplicationList(confirmed), true);
});

test('manual refresh with retained rows blocks opening while canonical status is in flight', () => {
  assert.equal(canOpenVerifiedApplicationList({ ...confirmed, readPending: true }), false);
});

test('failed manual canonical re-read keeps visible rows non-actionable (not a false empty state)', () => {
  assert.equal(canOpenVerifiedApplicationList({ ...confirmed, readFailed: true }), false);
  assert.equal(canOpenVerifiedApplicationList({ ...confirmed, readFailed: true, readPending: true }), false);
});

test('explicit successful retry restores verified action without changing the rows', () => {
  const unresolved = { ...confirmed, readFailed: true };
  assert.equal(canOpenVerifiedApplicationList(unresolved), false);
  assert.equal(canOpenVerifiedApplicationList({ ...unresolved, readFailed: false }), true);
});

test('signed-out, App Lock, or new user/session cannot navigate from prior index', () => {
  for (const input of [
    { ...confirmed, privateAllowed: false },
    { ...confirmed, expectedOwnerKey: null },
    { ...confirmed, freshlyVerifiedOwnerKey: null },
    { ...confirmed, expectedOwnerKey: '["candidate-B","session-1"]' },
    { ...confirmed, expectedOwnerKey: '["candidate-A","session-2"]' },
  ]) assert.equal(canOpenVerifiedApplicationList(input), false);
});

test('unverified index is not authorized even if the previous user key is present', () => {
  assert.equal(canOpenVerifiedApplicationList({ ...confirmed, listPresent: false }), false);
});

test('legitimate canonical empty [] index is distinct from unknown; individual row identity is checked by existing lease', () => {
  assert.equal(canOpenVerifiedApplicationList({ ...confirmed, listPresent: true }), true);
});
