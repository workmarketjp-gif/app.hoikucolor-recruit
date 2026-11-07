import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConfirmedCandidateMessage } from '../src/lib/confirmedCandidateMessage.ts';

const facility = { id: 'facility-msg-1', thread_id: 'thread-1', sender_role: 'facility', body: 'こんにちは。', created_at: '2026-11-07T00:00:00Z' };
const verified = { id: 'candidate-msg-2', thread_id: 'thread-1', sender_role: 'jobseeker', body: 'ありがとうございます。', created_at: '2026-11-07T00:01:00Z' };

test('a newly server-verified candidate reply becomes visible without a second full-detail read', () => {
  const previous = [facility];
  const result = mergeConfirmedCandidateMessage(previous, verified, 'ありがとうございます。');
  assert.deepEqual(result, [facility, verified]);
  assert.deepEqual(previous, [facility], 'must not mutate the existing thread');
});

test('canonical message id replaces its existing row, preventing duplicate rendering', () => {
  const stale = { ...verified, created_at: '2026-11-07T00:00:30Z' };
  const result = mergeConfirmedCandidateMessage([facility, stale], verified, 'ありがとうございます。');
  assert.equal(result.length, 2);
  assert.deepEqual(result[1], verified);
});

test('a separate identical-body reply retains its own canonical id', () => {
  const earlier = { ...verified, id: 'candidate-msg-1' };
  const result = mergeConfirmedCandidateMessage([earlier], verified, 'ありがとうございます。');
  assert.deepEqual(result.map((message) => message.id), ['candidate-msg-1', 'candidate-msg-2']);
});

test('reject facility-only, missing-id, or wrong-body confirmation before adding reply', () => {
  const bad = [{ ...verified, sender_role: 'facility' }, { ...verified, id: '' }, { ...verified, body: '他の文章' }];
  for (const message of bad) {
    assert.throws(() => mergeConfirmedCandidateMessage([facility], message, 'ありがとうございます。'), /確認結果が一致/);
  }
});

test('trimmed candidate draft matches the existing durable adapter input contract', () => {
  const result = mergeConfirmedCandidateMessage([], verified, ' ありがとうございます。  ');
  assert.deepEqual(result, [verified]);
});
