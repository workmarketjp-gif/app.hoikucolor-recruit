import test from 'node:test';
import assert from 'node:assert/strict';
import { mayPresentCareerReadFailure } from '../src/lib/careerReadPreflight.ts';

const ownerA = '["candidate-a","session-1"]';
const ownerB = '["candidate-b","session-2"]';

test('same-session current read presents a retryable token failure', () => {
  assert.equal(mayPresentCareerReadFailure(ownerA, ownerA, 8, 8, true), true);
});

test('candidate switch hides failure for former candidate', () => {
  assert.equal(mayPresentCareerReadFailure(ownerA, ownerB, 8, 8, true), false);
});

test('same candidate with a replacement session hides stale failure', () => {
  assert.equal(mayPresentCareerReadFailure(ownerA, '["candidate-a","session-2"]', 8, 8, true), false);
});

test('a more recent request suppresses an expired read failure', () => {
  assert.equal(mayPresentCareerReadFailure(ownerA, ownerA, 8, 9, true), false);
});

test('App Lock / shield suppresses private error presentation', () => {
  assert.equal(mayPresentCareerReadFailure(ownerA, ownerA, 8, 8, false), false);
});

test('missing session cannot claim an error slot for a private candidate', () => {
  assert.equal(mayPresentCareerReadFailure(null, null, 0, 0, true), false);
});

test('retry after an interrupted request can report its own failure', () => {
  assert.equal(mayPresentCareerReadFailure(ownerA, ownerA, 9, 9, true), true);
});
