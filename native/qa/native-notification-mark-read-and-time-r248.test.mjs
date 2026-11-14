import test from 'node:test';
import assert from 'node:assert/strict';
import { requireConfirmedNotificationRead } from '../src/lib/notificationMarkReadConfirmation.ts';
import { notificationRelativeTime } from '../src/lib/notificationRelativeTime.ts';

const now = Date.parse('2026-11-15T02:00:00.000Z');
const ago = (milliseconds) => new Date(now - milliseconds).toISOString();

test('only canonical boolean true confirms a successful per-notification write', () => {
  assert.doesNotThrow(() => requireConfirmedNotificationRead(true));
});
test('false means missing or revoked candidate-owned notification, not successful read', () => {
  assert.throws(() => requireConfirmedNotificationRead(false), { message: 'NOTIFICATION_NOT_FOUND' });
});
test('unknown and invalid RPC returns never impersonate confirmed write', () => {
  for (const value of [null, undefined, 0, 1, 'true', 'false', [], {}, { data: true }]) {
    assert.throws(() => requireConfirmedNotificationRead(value), { message: 'NOTIFICATION_MARK_READ_UNCONFIRMED' });
  }
});
test('Web-equivalent relative label within one minute, including future timestamp', () => {
  assert.equal(notificationRelativeTime(ago(0), now), 'たった今');
  assert.equal(notificationRelativeTime(ago(59_999), now), 'たった今');
  assert.equal(notificationRelativeTime(new Date(now + 120_000).toISOString(), now), 'たった今');
});
test('Web-equivalent Japanese minutes and hours at exact boundaries', () => {
  assert.equal(notificationRelativeTime(ago(60_000), now), '1分前');
  assert.equal(notificationRelativeTime(ago(59 * 60_000), now), '59分前');
  assert.equal(notificationRelativeTime(ago(60 * 60_000), now), '1時間前');
  assert.equal(notificationRelativeTime(ago(23 * 60 * 60_000), now), '23時間前');
});
test('Web-equivalent Japanese days and month/day after seven days', () => {
  assert.equal(notificationRelativeTime(ago(24 * 60 * 60_000), now), '1日前');
  assert.equal(notificationRelativeTime(ago(6 * 24 * 60 * 60_000), now), '6日前');
  const value = ago(7 * 24 * 60 * 60_000);
  assert.equal(notificationRelativeTime(value, now), new Intl.DateTimeFormat('ja-JP', { month:'numeric', day:'numeric' }).format(new Date(value)));
});
test('invalid dates cannot display fabricated timestamp information', () => {
  assert.equal(notificationRelativeTime('not-a-date', now), '');
  assert.equal(notificationRelativeTime('', now), '');
});
