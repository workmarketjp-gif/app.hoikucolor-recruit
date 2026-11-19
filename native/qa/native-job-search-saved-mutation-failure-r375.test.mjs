import assert from 'node:assert/strict';
import test from 'node:test';
import { savedJobMutationFailureNotice } from '../src/lib/jobSearchSavedMutationFailure.ts';

const owned = 'candidate-A:session-1';
const gate = (patch = {}) => ({
  attemptedOwnerKey: owned,
  currentOwnerKey: owned,
  attemptedSequence: 8,
  currentSequence: 8,
  requestGeneration: 12,
  currentGeneration: 12,
  privateAllowed: true,
  ...patch,
});

test('an ambiguous bookmark write is explicitly a saved-state warning for the same owner', () => {
  const result = savedJobMutationFailureNotice(gate());
  assert.equal(result.ownerKey, owned);
  assert.match(result.value, /保存結果を確認できませんでした/);
  assert.doesNotMatch(result.value, /求人を検索できませんでした/);
});

test('account switch cannot publish an old saved-job mutation failure', () => {
  assert.equal(savedJobMutationFailureNotice(gate({currentOwnerKey: 'candidate-B:session-2'})), null);
});

test('same candidate with a replaced Clerk session cannot reuse an old failure', () => {
  assert.equal(savedJobMutationFailureNotice(gate({currentOwnerKey: 'candidate-A:session-2'})), null);
});

test('older mutation or replaced screen generation cannot publish a warning', () => {
  assert.equal(savedJobMutationFailureNotice(gate({currentSequence: 9})), null);
  assert.equal(savedJobMutationFailureNotice(gate({currentGeneration: 13})), null);
});

test('App Lock or missing owner must not publish a private warning', () => {
  assert.equal(savedJobMutationFailureNotice(gate({privateAllowed: false})), null);
  assert.equal(savedJobMutationFailureNotice(gate({attemptedOwnerKey: null})), null);
});
