import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureCandidateMessageInvocationReview,
  candidateMessageSendNeedsReview,
} from '../src/lib/candidateMessageInvocationReview.ts';

const attempt = {
  submittedDraft: '面接は午前を希望します',
  knownMessageIds: ['known-1'],
  ownerId: 'candidate-A',
  ownerSessionId: 'session-A',
  applicationId: 'application-A',
};

test('capture exact candidate/application/session when RPC is first invoked', () => {
  const saved = captureCandidateMessageInvocationReview(attempt);
  assert.deepEqual(saved, attempt);
  assert.notEqual(saved.knownMessageIds, attempt.knownMessageIds);
});

test('pre-send IDs cannot be mutated by a later canonical list refresh', () => {
  const ids = ['known-1'];
  const saved = captureCandidateMessageInvocationReview({ ...attempt, knownMessageIds: ids });
  ids.push('received-2');
  assert.deepEqual(saved.knownMessageIds, ['known-1']);
});

test('async blur preserves quarantine even before React updates needsReview', () => {
  const saved = captureCandidateMessageInvocationReview(attempt);
  assert.equal(candidateMessageSendNeedsReview(false, saved), true);
});

test('state-only review also blocks duplicate Send', () => {
  assert.equal(candidateMessageSendNeedsReview(true, null), true);
});

test('verified clean screen is unlocked only after invocation record cleared', () => {
  assert.equal(candidateMessageSendNeedsReview(false, null), false);
});

test('record never transforms another candidate identity or draft', () => {
  const saved = captureCandidateMessageInvocationReview(attempt);
  assert.equal(saved.ownerId, 'candidate-A');
  assert.equal(saved.ownerSessionId, 'session-A');
  assert.equal(saved.applicationId, 'application-A');
  assert.equal(saved.submittedDraft, '面接は午前を希望します');
});
