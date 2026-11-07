import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifiedCandidateMessageRows } from '../src/lib/candidateMessageReadback.ts';

const thread = '6411d4af-86f0-4791-b710-43fdcda51c25';
const candidate = { id: 'bd2bc450-0663-4c3b-a8c6-1e678a5dce2f', thread_id: thread,
  sender_role: 'jobseeker', body: '次の日曜日に見学できますか？', created_at: '2026-11-07T02:00:00Z' };
const facility = { ...candidate, id: '8ff79b08-b4bb-47f5-82eb-a13920f098e1',
  sender_role: 'facility', body: 'はい、可能です。', created_at: '2026-11-07T02:15:00Z' };

test('an authenticated empty canonical thread is genuinely empty', () => {
  assert.deepEqual(verifiedCandidateMessageRows([]), []);
});

test('preserves a fully valid same-thread conversation with Japanese long text', () => {
  const rows = [candidate, { ...facility, body: '保育方針について伺いたいです。'.repeat(100) }];
  assert.deepEqual(verifiedCandidateMessageRows(rows), rows);
});

test('malformed canonical responses cannot be converted to an empty thread', () => {
  for (const result of [null, undefined, {}, { messages: [] }, '[]', false, 0]) {
    assert.throws(() => verifiedCandidateMessageRows(result), /確認できません/);
  }
});

test('all message fields are required for trustworthy readback', () => {
  for (const patch of [
    { id: 'not-uuid' }, { thread_id: '' }, { sender_role: 'admin' },
    { body: null }, { created_at: 'invalid-date' }, { created_at: null },
  ]) assert.throws(() => verifiedCandidateMessageRows([{ ...candidate, ...patch }]), /整合性/);
});

test('rejects rows with duplicate IDs or belonging to different message threads', () => {
  assert.throws(() => verifiedCandidateMessageRows([candidate, candidate]), /整合性/);
  assert.throws(() => verifiedCandidateMessageRows([candidate, { ...facility, thread_id: '11c82317-5e1e-4b30-9cd5-0db3628f77e1' }]), /整合性/);
});

test('rejects non-object rows without silently ignoring them', () => {
  for (const row of [null, 5, 'bad row', []]) {
    assert.throws(() => verifiedCandidateMessageRows([candidate, row]), /整合性/);
  }
});
