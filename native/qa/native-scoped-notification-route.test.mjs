import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedNotificationHref, verifiedFocusId, verifiedNotificationId, focusedOwnedItem } from '../src/lib/scopedNotificationRoute.ts';

const SCOUT_A = '123e4567-e89b-42d3-a456-426614174000';
const SPOT_A = '123e4567-e89b-42d3-a456-426614174001';
const OTHER = '123e4567-e89b-42d3-a456-426614174002';
const route = (route_key, route_params) => ({route_key, route_params});

test('server-verified scout invitation maps to its specific Native scout', () => {
  assert.equal(scopedNotificationHref(route('scouts', { scoutId: SCOUT_A, jobId: OTHER })), `/scouts?scoutId=${SCOUT_A}`);
});
test('server-verified spot shift maps to its specific Native assignment', () => {
  assert.equal(scopedNotificationHref(route('spot_assignments', { spotAssignmentId: SPOT_A, applicationId: OTHER })), `/spot-jobs?assignmentId=${SPOT_A}`);
});
test('no ambiguous or missing private identity can become a navigation target', () => {
  for (const key of ['scouts','spot_assignments']) {
    assert.equal(scopedNotificationHref(route(key, {})), null);
    assert.equal(scopedNotificationHref(route(key, null)), null);
  }
});
test('untrusted path, invalid UUID and query injection are not accepted', () => {
  assert.equal(scopedNotificationHref(route('scouts', { scoutId: `${SCOUT_A}&hijack=1` })), null);
  assert.equal(scopedNotificationHref(route('spot_assignments', { spotAssignmentId: '../../profile' })), null);
  assert.equal(scopedNotificationHref(route('scouts', { scoutId: 'not-a-uuid' })), null);
  assert.equal(scopedNotificationHref(route('spot_assignments', { spotAssignmentId: [SPOT_A] })), null);
});
test('unrelated or legacy route keys cannot be misclassified as private target', () => {
  assert.equal(scopedNotificationHref(route('notifications', { scoutId: SCOUT_A })), null);
  assert.equal(scopedNotificationHref(route('application_messages', { scoutId: SCOUT_A })), null);
  assert.equal(scopedNotificationHref(route('scout_received', { scoutId: SCOUT_A })), null);
});
test('Native params reject arrays and missing/invalid values', () => {
  assert.equal(verifiedFocusId(SCOUT_A), SCOUT_A);
  assert.equal(verifiedFocusId([SCOUT_A]), null);
  assert.equal(verifiedFocusId(undefined), null);
  assert.equal(verifiedNotificationId({ toString: () => SCOUT_A }), null);
});
test('focus is confined to the actual authorized canonical rows, never invented', () => {
  const rows = [{ scout_id: SCOUT_A, facility_name: '検証用A' }];
  assert.equal(focusedOwnedItem(rows, SCOUT_A, (row) => row.scout_id)?.facility_name, '検証用A');
  assert.equal(focusedOwnedItem(rows, OTHER, (row) => row.scout_id), null);
  assert.equal(focusedOwnedItem([], SCOUT_A, (row) => row.scout_id), null);
});
test('route ID and result ID remain case-insensitively valid UUIDs without widening permissions', () => {
  assert.equal(verifiedFocusId(SPOT_A.toUpperCase()), SPOT_A.toUpperCase());
  assert.equal(focusedOwnedItem([{ assignment_id: SPOT_A }], SPOT_A.toUpperCase(), (row) => row.assignment_id), null);
});
