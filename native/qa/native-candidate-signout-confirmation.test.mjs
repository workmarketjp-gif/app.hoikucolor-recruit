import assert from 'node:assert/strict';
import test from 'node:test';
import { canConfirmCandidateSignOut } from '../src/lib/candidateSignOutConfirmation.ts';

const ownerA = '["candidate-a","session-a"]';
const ownerB = '["candidate-b","session-b"]';

test('confirmation can proceed only for same unshielded candidate and idle deletion boundary', () => {
  assert.equal(canConfirmCandidateSignOut(ownerA, ownerA, true, false), true);
});

test('a pending confirmation cannot sign out a different Clerk account/session', () => {
  assert.equal(canConfirmCandidateSignOut(ownerA, ownerB, true, false), false);
  assert.equal(canConfirmCandidateSignOut(ownerA, null, true, false), false);
  assert.equal(canConfirmCandidateSignOut(null, ownerA, true, false), false);
});

test('App Lock, ongoing deletion or an unknown private state revokes the action', () => {
  assert.equal(canConfirmCandidateSignOut(ownerA, ownerA, false, false), false);
  assert.equal(canConfirmCandidateSignOut(ownerA, ownerA, true, true), false);
});
