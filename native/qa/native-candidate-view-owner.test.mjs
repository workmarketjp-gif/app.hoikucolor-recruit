import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateViewOwnerKey, readCandidateOwnedView } from '../src/lib/candidateViewOwner.ts';

const userA = candidateViewOwnerKey('candidate:A', 'session:1');
const userB = candidateViewOwnerKey('candidate:B', 'session:1');
const secondSession = candidateViewOwnerKey('candidate:A', 'session:2');
const original = { ownerKey: userA, value: [{ applicationId: 'synthetic-A-only' }] };

test('same user and exact session may read the current in-memory list', () => {
  assert.deepEqual(readCandidateOwnedView(original, userA, true), original.value);
});
test('different account never sees previous candidate list', () => {
  assert.equal(readCandidateOwnedView(original, userB, true), null);
});
test('new session for same user cannot inherit previous session private list', () => {
  assert.equal(readCandidateOwnedView(original, secondSession, true), null);
});
test('App Lock/privacy quarantine suppresses previous read, even for same owner', () => {
  assert.equal(readCandidateOwnedView(original, userA, false), null);
});
test('no loaded snapshot is not a confirmed empty list', () => {
  assert.equal(readCandidateOwnedView(null, userA, true), null);
});
test('signed out or incomplete identity cannot display prior state', () => {
  assert.equal(readCandidateOwnedView(original, null, true), null);
  assert.equal(candidateViewOwnerKey('', 'session:1'), null);
  assert.equal(candidateViewOwnerKey('candidate:A', '  '), null);
});
test('delimiter and special-character collisions do not join identities', () => {
  assert.notEqual(candidateViewOwnerKey('a:b', 'c'), candidateViewOwnerKey('a', 'b:c'));
  assert.notEqual(candidateViewOwnerKey('a]",', 'b'), candidateViewOwnerKey('a', '"]b'));
});
test('empty authorized list remains different from unloaded list', () => {
  assert.deepEqual(readCandidateOwnedView({ ownerKey: userA, value: [] }, userA, true), []);
  assert.equal(readCandidateOwnedView(null, userA, true), null);
});
test('unknown identity and inherited object keys do not grant access', () => {
  assert.equal(readCandidateOwnedView(original, '__proto__', true), null);
  assert.equal(readCandidateOwnedView(original, 'constructor', true), null);
});
