import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationStatusLabel, buildMessageInbox } from '../src/lib/messageInbox.ts';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView } from '../src/lib/candidateViewOwner.ts';

const a = candidateViewOwnerKey('synthetic-A', 'session-1');
const b = candidateViewOwnerKey('synthetic-B', 'session-1');
const renewed = candidateViewOwnerKey('synthetic-A', 'session-2');
const row = { id: 'b7d686d8-8f45-46c3-8e63-186ee2e7183a', status: 'reviewing',
  job_title: '架空の求人', facility_name: '架空の園', updated_at: '2026-01-01' };
const old = { ownerKey: a, value: [row] };

test('freshly verified owner sees current canonical application rows', () => {
  assert.deepEqual(readCandidateFreshlyVerifiedView(old, a, true, a), [row]);
});
test('App Lock immediately hides formerly verified rows and attention', () => {
  assert.equal(readCandidateFreshlyVerifiedView(old, a, false, a), null);
  assert.equal(readCandidateFreshlyVerifiedView({ ownerKey: a, value: { unread: 1 } }, a, false, a), null);
});
test('same-session unlock cannot reuse a pre-lock lease', () => {
  assert.equal(readCandidateFreshlyVerifiedView(old, a, true, null), null);
});
test('account switch and new session cannot inherit old private rows', () => {
  assert.equal(readCandidateFreshlyVerifiedView(old, b, true, b), null);
  assert.equal(readCandidateFreshlyVerifiedView(old, renewed, true, renewed), null);
});
test('new owner needs its own confirmed read', () => {
  const fresh = { ownerKey: b, value: [row] };
  assert.equal(readCandidateFreshlyVerifiedView(fresh, b, true, null), null);
  assert.deepEqual(readCandidateFreshlyVerifiedView(fresh, b, true, b), [row]);
});
test('all Web canonical application statuses are translated into Japanese', () => {
  for (const [key, value] of Object.entries({
    new: '応募済み', applied: '応募済み', reviewing: '書類確認中',
    screening: '書類確認中', review: '確認中', interview: '面接予定',
    offered: '内定', offer: '内定', hired: '採用',
    rejected: '選考終了', withdrawn: '辞退',
  })) assert.equal(applicationStatusLabel(key), value);
});
test('unknown application statuses are not fabricated', () => {
  assert.equal(applicationStatusLabel('unrecognized_status'), 'unrecognized_status');
});
test('message thread index uses the shared label, no inferred notification count', () => {
  const result = buildMessageInbox([row], null);
  assert.equal(result.rows[0].statusLabel, '書類確認中');
  assert.equal(result.unreadCount, null);
  assert.equal(result.pendingScouts, null);
  assert.equal(result.newestApplicationId, null);
});
test('empty canonical message index does not invent unread state', () => {
  assert.deepEqual(buildMessageInbox([], null), { rows: [], unreadCount: null, pendingScouts: null, newestApplicationId: null });
});
