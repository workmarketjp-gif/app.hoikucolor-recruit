import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getJobseekerAttentionSummary,
  markVisibleApplicationMessagesRead,
  nativeAttentionMessageHref,
} from '../src/lib/attentionApi.ts';

const applicationId = 'b7d686d8-8f45-46c3-8e63-186ee2e7183a';
const empty = { unanswered_interviews_count: 0, unread_messages_count: 0, pending_scouts_count: 0,
  next_interview: null, next_message: null, next_scout: null };
const rpc = (data, error = null) => ({ rpc: async () => ({ data, error }) });

test('genuine server JSONB all-zero attention is a confirmed zero, not an error', async () => {
  assert.deepEqual(await getJobseekerAttentionSummary(rpc(empty)), empty);
});

test('genuine nonzero server counts and authorized application links are preserved', async () => {
  const data = { ...empty, unread_messages_count: 3, pending_scouts_count: 1,
    next_message: { application_id: applicationId, notification_id: 'synthetic', created_at: '2026-11-07T01:00:00Z',
      facility_name: '架空の園', link_url: `/applications?application_id=${applicationId}` } };
  const result = await getJobseekerAttentionSummary(rpc(data));
  assert.equal(result.unread_messages_count, 3);
  assert.equal(result.pending_scouts_count, 1);
  assert.equal(nativeAttentionMessageHref(result), `/application/${applicationId}?focus=messages`);
});

test('missing or malformed summary is not allowed to fabricate zero unread notifications', async () => {
  for (const data of [null, undefined, [], {}, 'not-json', 0, { unread_messages_count: 0 }]) {
    await assert.rejects(getJobseekerAttentionSummary(rpc(data)), /確認できません/);
  }
});

test('malformed counts fail closed instead of rounding negatives/fractions or coercing strings', async () => {
  for (const field of ['unanswered_interviews_count', 'unread_messages_count', 'pending_scouts_count']) {
    for (const value of [null, undefined, -1, 2.5, '0', '5', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(getJobseekerAttentionSummary(rpc({ ...empty, [field]: value })), /確認できません/, `${field}=${String(value)}`);
    }
  }
});

test('a confirmed zero-row read acknowledgment is valid; the authorized RPC is invoked once', async () => {
  let called = [];
  const client = { rpc: async (name, params) => { called.push([name, params]); return { data: 0, error: null }; } };
  assert.equal(await markVisibleApplicationMessagesRead(client, applicationId), 0);
  assert.deepEqual(called, [['hc_jobseeker_mark_application_messages_read', { p_application_id: applicationId }]]);
});

test('unconfirmed read acknowledgment must not be treated as successful', async () => {
  for (const data of [null, undefined, {}, [], -1, 1.5, '0', NaN, Infinity]) {
    await assert.rejects(markVisibleApplicationMessagesRead(rpc(data), applicationId), /確認できません/);
  }
});

test('backend errors remain failures, not empty attention or read acknowledgment', async () => {
  const error = new Error('AUTH_REVOKED');
  await assert.rejects(getJobseekerAttentionSummary(rpc(null, error)), error);
  await assert.rejects(markVisibleApplicationMessagesRead(rpc(null, error), applicationId), error);
});
