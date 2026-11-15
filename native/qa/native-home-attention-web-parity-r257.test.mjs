import test from 'node:test';
import assert from 'node:assert/strict';
import { homeAttentionActions } from '../src/lib/homeAttentionActions.ts';
import { getJobseekerAttentionSummary } from '../src/lib/attentionApi.ts';

const appId = 'b7d686d8-8f45-46c3-8e63-186ee2e7183a';
const interviewId = 'c8d686d8-8f45-46c3-8e63-186ee2e7183b';
const zero = { unanswered_interviews_count: 0, unread_messages_count: 0,
  pending_scouts_count: 0, next_interview: null, next_message: null, next_scout: null };
const summary = (other = {}) => ({ ...zero, ...other });
const rpc = (data) => ({ rpc: async () => ({ data, error: null }) });

test('unknown attention is not displayed as confirmed zero or an actionable pending event', () => {
  assert.deepEqual(homeAttentionActions(null), {
    interview: null, scout: null, message: { count: null, href: '/messages' },
    applicationHref: '/(tabs)/applications',
  });
  const confirmed = homeAttentionActions(zero);
  assert.equal(confirmed.message.count, 0);
  assert.equal(confirmed.interview, null);
  assert.equal(confirmed.scout, null);
});

test('authorized canonical interview targets focus the specific application and interview', async () => {
  const data = await getJobseekerAttentionSummary(rpc(summary({
    unanswered_interviews_count: 2,
    next_interview: { application_id: appId, interview_id: interviewId,
      scheduled_at: '2026-11-18T04:00:00Z', facility_name: '架空の園', link_url: 'https://evil.example' },
  })));
  assert.deepEqual(homeAttentionActions(data).interview, {
    count: 2, href: `/application/${appId}?focus=interview&interviewId=${interviewId}`,
  });
});

test('invalid or missing interview focus IDs never navigate to an unverified application', () => {
  for (const next of [null, { application_id: 'not-uuid', interview_id: interviewId },
    { application_id: appId, interview_id: 'not-uuid' }]) {
    assert.equal(homeAttentionActions(summary({ unanswered_interviews_count: 1, next_interview: next })).interview.href,
      '/(tabs)/applications');
  }
});

test('scout pending prompt opens its existing owner-checked inbox, not a remote link', () => {
  const actions = homeAttentionActions(summary({ pending_scouts_count: 3,
    next_scout: { link_url: 'https://evil.example', scout_id: appId } }));
  assert.deepEqual(actions.scout, { count: 3, href: '/scouts' });
});

test('newest private message routes precisely, but inbox remains a safe fallback', () => {
  const good = homeAttentionActions(summary({ unread_messages_count: 4,
    next_message: { application_id: appId, link_url: 'https://evil.example' } }));
  assert.deepEqual(good.message, { count: 4, href: `/application/${appId}?focus=messages` });
  for (const next of [null, { application_id: 'broken', link_url: '/malicious' }]) {
    assert.deepEqual(homeAttentionActions(summary({ unread_messages_count: 4, next_message: next })).message,
      { count: 4, href: '/messages' });
  }
});

test('malformed source counts cannot become clickable faux-positive state', async () => {
  for (const value of [null, '1', -1, 1.5]) {
    await assert.rejects(getJobseekerAttentionSummary(rpc(summary({ pending_scouts_count: value }))),
      /確認できません/);
  }
});
