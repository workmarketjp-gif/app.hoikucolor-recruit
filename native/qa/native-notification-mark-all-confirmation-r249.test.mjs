import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireConfirmedNotificationMarkAllCount } from '../src/lib/notificationMarkAllConfirmation.ts';
import { createNotificationMarkAllSingleFlight } from '../src/lib/notificationMarkAllSingleFlight.ts';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('canonical SQL RETURNS integer: an actual positive count confirms updated owned unread rows', () => {
  assert.equal(requireConfirmedNotificationMarkAllCount(1), 1);
  assert.equal(requireConfirmedNotificationMarkAllCount(20), 20);
  assert.equal(requireConfirmedNotificationMarkAllCount('12'), 12);
});
test('zero is valid if another session already marked all rows before this RPC', () => {
  assert.equal(requireConfirmedNotificationMarkAllCount(0), 0);
  assert.equal(requireConfirmedNotificationMarkAllCount('0'), 0);
});
test('null/malformed result is NOT proof of a successful mark-all write', () => {
  for (const value of [null, undefined, true, false, {}, [], [1], 'true', '0.0', '01', '', ' 1', -1, -0.1, 1.5, NaN, Infinity, '1e2', 2_147_483_648, '2147483648']) {
    assert.throws(() => requireConfirmedNotificationMarkAllCount(value), {message:'NOTIFICATION_MARK_ALL_UNCONFIRMED'});
  }
});
test('normal positive signed PostgreSQL 32-bit upper bound is accepted', () => {
  assert.equal(requireConfirmedNotificationMarkAllCount(2_147_483_647), 2_147_483_647);
  assert.equal(requireConfirmedNotificationMarkAllCount('2147483647'), 2_147_483_647);
});
test('Native RPC adapter gates return value and does not misread error-only results', () => {
  const adapter = read('../src/lib/notifications.ts');
  const fn = adapter.match(/export async function markAllNotificationsRead\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(fn, /const\s*\{\s*data\s*,\s*error\s*\}\s*=\s*await client\.rpc\('hc_jobseeker_mark_all_notifications_read'\)/);
  assert.match(fn, /if\s*\(error\)\s*throw error/);
  assert.match(fn, /return requireConfirmedNotificationMarkAllCount\(data\)/);
});
test('mark-all action includes per-owner immediate concurrency guard and session recheck before write', () => {
  const context = read('../src/contexts/NotificationContext.tsx');
  const action = context.match(/const markAllRead = useCallback\([\s\S]*?\n  \}, \[[^\]]*\]\);/)?.[0] || '';
  assert.match(action, /tryStart\(ownerAtPress\)/);
  assert.match(action, /candidateViewOwnerKey\(pinned\.ownerId, pinned\.ownerSessionId\) !== ownerAtPress/);
  assert.match(action, /!pinned\.isCurrent\(\)/);
  assert.match(action, /await markAllNotificationsRead\(pinned\.client\)/);
  assert.match(action, /await refresh\(\)/);
  assert.match(action, /finally\s*\{/);
  assert.match(action, /\.complete\(ownerAtPress\)/);
});
test('view disables repeated mark-all while its owner is pending', () => {
  const screen = read('../src/app/(tabs)/notifications.tsx');
  assert.match(screen, /!notifications\.markAllReadPending/);
  assert.match(screen, /disabled=\{!canMarkAll\}/);
});
test('immediate repeated same-owner actions are blocked before React state update', () => {
  const gate = createNotificationMarkAllSingleFlight();
  assert.equal(gate.tryStart('candidateA|sessionA'), true);
  assert.equal(gate.tryStart('candidateA|sessionA'), false);
  assert.equal(gate.isPending('candidateA|sessionA'), true);
  gate.complete('candidateA|sessionA');
  assert.equal(gate.tryStart('candidateA|sessionA'), true);
});
test('unresolved previous owner does not block new candidate owner', () => {
  const gate = createNotificationMarkAllSingleFlight();
  assert.equal(gate.tryStart('candidateA|sessionA'), true);
  assert.equal(gate.tryStart('candidateB|sessionB'), true);
  gate.complete('candidateA|sessionA');
  assert.equal(gate.isPending('candidateB|sessionB'), true);
});
