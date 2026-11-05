import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessageInbox } from '../src/lib/messageInbox.ts';

// Synthetic UUIDs, not real candidate or facility identifiers.
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
const NOT_AUTHORIZED = '00000000-0000-4000-8000-000000000004';
function application(id, overrides = {}) {
  return {id, status:'applied', facility_name:'合成園',job_title:'保育士',updated_at:'2026-11-04T04:00:00Z',...overrides};
}
function summary(overrides = {}) {
  return {unread_messages_count:2,pending_scouts_count:1,next_message:{application_id:A},...overrides};
}

test('canonical Web status labels and active applications before closed entries', () => {
  const rows = buildMessageInbox([
    application(B,{status:'withdrawn',updated_at:'2026-11-04T20:00:00Z'}),
    application(A,{status:'reviewing',updated_at:'2026-11-04T04:00:00Z'}),
    application(C,{status:'interview',updated_at:'2026-11-04T06:00:00Z'}),
  ],summary()).rows;
  assert.deepEqual(rows.map(r=>r.applicationId),[C,A,B]);
  assert.deepEqual(rows.map(r=>r.statusLabel),['面接予定','書類確認中','辞退']);
});

test('only the application named by the canonical summary is labelled unread', () => {
  const s=buildMessageInbox([application(A),application(B)],summary());
  assert.equal(s.unreadCount,2);
  assert.equal(s.pendingScouts,1);
  assert.deepEqual(s.rows.map(r=>r.hasNewestUnread),[true,false]);
});

test('unread metadata is not invented when the attention RPC failed', () => {
  const s=buildMessageInbox([application(A)],null);
  assert.equal(s.unreadCount,null);
  assert.equal(s.pendingScouts,null);
  assert.equal(s.newestApplicationId,null);
  assert.equal(s.rows[0].hasNewestUnread,false);
});

test('a revoked/unlisted application id never becomes a navigable new-message target', () => {
  const s=buildMessageInbox([application(A)],summary({next_message:{application_id:NOT_AUTHORIZED}}));
  assert.equal(s.newestApplicationId,null);
  assert.equal(s.rows[0].hasNewestUnread,false);
});

test('zero unread count never labels a thread even with a stale next_message', () => {
  const s=buildMessageInbox([application(A)],summary({unread_messages_count:0}));
  assert.equal(s.unreadCount,0);
  assert.equal(s.newestApplicationId,null);
});

test('invalid application identifiers are discarded before navigation', () => {
  const s=buildMessageInbox([application('not-a-uuid'),application(A)],summary({next_message:{application_id:'not-a-uuid'}}));
  assert.equal(s.rows.length,1);
  assert.equal(s.rows[0].applicationId,A);
  assert.equal(s.newestApplicationId,null);
});

test('missing or malformed unread counts are unknown, not false zero', () => {
  for (const value of [-1, NaN, Infinity, undefined, '2']) {
    const s=buildMessageInbox([application(A)],summary({unread_messages_count:value}));
    assert.equal(s.unreadCount,null);
    assert.equal(s.newestApplicationId,null);
  }
});

test('synthetic missing facility and title use Web fallbacks, never invented details', () => {
  const s=buildMessageInbox([application(A,{facility_name:'',job_title:''})],null);
  assert.equal(s.rows[0].facilityName,'園');
  assert.equal(s.rows[0].jobTitle,'求人');
});

test('invalid timestamps cannot destabilize deterministic order', () => {
  const s=buildMessageInbox([
    application(A,{updated_at:'not-a-date'}),
    application(B,{updated_at:'2026-11-05T00:00:00Z'}),
  ],null);
  assert.deepEqual(s.rows.map(r=>r.applicationId),[B,A]);
});

test('Web statuses preserve unknown canonical status text without guessing', () => {
  const s=buildMessageInbox([application(A,{status:'canonical-new-status'})],null);
  assert.equal(s.rows[0].statusLabel,'canonical-new-status');
});
