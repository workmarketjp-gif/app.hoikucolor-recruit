import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldDeferMessageNotificationRead } from '../src/lib/notificationMessageReadParity.ts';

const applicationId = 'c4f3a2b1-1234-4123-8a12-9c1234567890';
const canonicalMessageRoute = {
  route_key: 'application_messages',
  notification_type: 'message_received',
  route_params: { applicationId },
};
const focusedTarget = `/application/${applicationId}?focus=messages&focusKey=synthetic-notification`;

test('verified message route defers read to the visible facility-message panel', () => {
  assert.equal(shouldDeferMessageNotificationRead(canonicalMessageRoute, focusedTarget), true);
});

test('ordinary interview/status notifications still require explicit canonical read', () => {
  assert.equal(shouldDeferMessageNotificationRead({
    ...canonicalMessageRoute, notification_type: 'interview_scheduled',
  }, focusedTarget), false);
});

test('message-type notifications without the authorized message route cannot skip read', () => {
  assert.equal(shouldDeferMessageNotificationRead({
    ...canonicalMessageRoute, route_key: 'application_detail',
  }, focusedTarget), false);
});

test('another application or untrusted redirect never qualifies for deferred read', () => {
  const otherId = 'c4f3a2b1-1234-4123-8a12-9c1234567891';
  assert.equal(shouldDeferMessageNotificationRead(canonicalMessageRoute,
    `/application/${otherId}?focus=messages`), false);
  assert.equal(shouldDeferMessageNotificationRead(canonicalMessageRoute,
    'https://evil.example/redirect?focus=messages'), false);
  assert.equal(shouldDeferMessageNotificationRead(canonicalMessageRoute,
    `/application/${applicationId}`), false);
  assert.equal(shouldDeferMessageNotificationRead(canonicalMessageRoute,
    `/application/${applicationId}?focus=messages-malformed`), false);
});

test('missing, malformed or ambiguous application identity never skips mark-read', () => {
  for (const route_params of [undefined, {}, { applicationId: '../other' }, { applicationId: 'not-a-uuid' }]) {
    assert.equal(shouldDeferMessageNotificationRead({
      ...canonicalMessageRoute, route_params,
    }, focusedTarget), false);
  }
});

test('other verified message focus targets preserve the existing Web defer behavior', () => {
  assert.equal(shouldDeferMessageNotificationRead(canonicalMessageRoute,
    `/application/${applicationId}?focus=messages`), true);
  assert.equal(shouldDeferMessageNotificationRead(canonicalMessageRoute,
    `/application/${applicationId}?focus=interview`), false);
});
