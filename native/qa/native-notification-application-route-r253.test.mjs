import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedApplicationNotificationId, scopedNotificationHref } from '../src/lib/scopedNotificationRoute.ts';

const APP = '123e4567-e89b-42d3-a456-426614174011';
const route = (route_key, route_params) => ({ route_key, route_params });

test('candidate-owned messages route requires and preserves the exact canonical application', () => {
  assert.equal(verifiedApplicationNotificationId(route('application_messages', { applicationId: APP })), APP);
  assert.equal(verifiedApplicationNotificationId(route('application_messages', { applicationId: APP.toUpperCase() })), APP.toUpperCase());
});

test('interview and status details retain their authenticated application target', () => {
  assert.equal(verifiedApplicationNotificationId(route('application_interview', { applicationId: APP })), APP);
  assert.equal(verifiedApplicationNotificationId(route('application_detail', { applicationId: APP })), APP);
});

test('missing or malformed application destinations are never downgraded to a read-but-not-opened notification', () => {
  for (const key of ['application_messages', 'application_interview', 'application_detail']) {
    for (const params of [null, {}, { applicationId: null }, { applicationId: '' },
      { applicationId: '../profile' }, { applicationId: [APP] }, { applicationId: `${APP}?focus=messages` },
      { applicationId: 'not-a-uuid' }]) {
      assert.throws(() => verifiedApplicationNotificationId(route(key, params)),
        { message: 'NOTIFICATION_TARGET_UNAVAILABLE' }, `${key} ${JSON.stringify(params)}`);
    }
  }
});

test('other route keys keep their own existing canonical route rules', () => {
  assert.equal(verifiedApplicationNotificationId(route('scouts', { applicationId: APP })), null);
  assert.equal(verifiedApplicationNotificationId(route('spot_assignments', { applicationId: APP })), null);
  assert.equal(verifiedApplicationNotificationId(route('visits', { applicationId: APP })), null);
  assert.equal(verifiedApplicationNotificationId(route('notifications', null)), null);
  assert.equal(scopedNotificationHref(route('scouts', { scoutId: APP })), `/scouts?scoutId=${APP}`);
});

test('application destinations do not become scout or spot paths', () => {
  assert.equal(scopedNotificationHref(route('application_messages', { applicationId: APP })), null);
  assert.equal(scopedNotificationHref(route('application_interview', { applicationId: APP })), null);
  assert.equal(scopedNotificationHref(route('application_detail', { applicationId: APP })), null);
});
