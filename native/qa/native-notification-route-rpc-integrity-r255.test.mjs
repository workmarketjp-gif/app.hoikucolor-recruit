import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCanonicalResolvedNotificationRoute, verifiedApplicationNotificationId, scopedNotificationHref } from '../src/lib/scopedNotificationRoute.ts';

const APP = '123e4567-e89b-42d3-a456-426614174011';
const SCOUT = '123e4567-e89b-42d3-a456-426614174012';
const raw = (route_key, route_params = null, notification_type = 'message_received') =>
  ({ route_key, route_params, notification_type });

test('single canonical route returned as object or one-row table remains usable', () => {
  const route = raw('application_messages', { applicationId: APP });
  assert.deepEqual(parseCanonicalResolvedNotificationRoute(route), route);
  assert.deepEqual(parseCanonicalResolvedNotificationRoute([route]), route);
  assert.equal(verifiedApplicationNotificationId(parseCanonicalResolvedNotificationRoute([route])), APP);
});

test('canonical known scout/spot/visit/notification routes are preserved', () => {
  const scout = parseCanonicalResolvedNotificationRoute(raw('scouts', { scoutId: SCOUT }, 'scout_received'));
  assert.equal(scopedNotificationHref(scout), `/scouts?scoutId=${SCOUT}`);
  for (const key of ['application_interview', 'application_detail', 'spot_assignments', 'visits', 'notifications']) {
    assert.equal(parseCanonicalResolvedNotificationRoute(raw(key, null, 'test_type')).route_key, key);
  }
  assert.equal(parseCanonicalResolvedNotificationRoute(raw('visits')).route_params, null);
  assert.equal(parseCanonicalResolvedNotificationRoute({ route_key: 'notifications', notification_type: 'test_type' }).route_params, null);
});

test('failed, empty and ambiguous RPC results cannot silently become a successful target', () => {
  for (const result of [null, undefined, '', false, 0, {}, [], [raw('visits'), raw('visits')],
    [null], [[]], [false], { route_key: 'visits' }]) {
    assert.throws(() => parseCanonicalResolvedNotificationRoute(result),
      { message: 'NOTIFICATION_ROUTE_UNAVAILABLE' }, `${JSON.stringify(result)}`);
  }
});

test('unsupported route key and malformed route metadata fail closed', () => {
  for (const result of [
    raw('future_unknown_route'), raw('scout_received'), raw(''), raw(12),
    raw('visits', [], 'visit_confirmed'), raw('visits', 'invalid', 'visit_confirmed'),
    raw('visits', false, 'visit_confirmed'), raw('visits', null, ''),
    raw('visits', {}, null), raw('visits', {}, ['message_received']),
  ]) {
    assert.throws(() => parseCanonicalResolvedNotificationRoute(result),
      { message: 'NOTIFICATION_ROUTE_UNAVAILABLE' }, `${JSON.stringify(result)}`);
  }
});

test('route parser does not expand per-target permissions: malformed application/scout still fails', () => {
  const application = parseCanonicalResolvedNotificationRoute(raw('application_messages', { applicationId: 'fake' }));
  assert.throws(() => verifiedApplicationNotificationId(application), { message: 'NOTIFICATION_TARGET_UNAVAILABLE' });
  const scout = parseCanonicalResolvedNotificationRoute(raw('scouts', { scoutId: '../profile' }));
  assert.equal(scopedNotificationHref(scout), null);
});
