import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidateNotificationBadge } from '../src/lib/candidateNotificationBadge.ts';

test('canonical unread count: zero, unknown, invalid and App Lock do not show a false badge', () => {
  for (const input of [null, undefined, 0, -1, Number.NaN, Infinity, -Infinity, 0.5, 3.14]) {
    assert.equal(candidateNotificationBadge(input), null);
  }
});
test('canonical unread badges show exact count to 99 and 99+ above it', () => {
  for (const value of [1, 2, 9, 10, 99]) {
    assert.equal(candidateNotificationBadge(value), String(value));
  }
  assert.equal(candidateNotificationBadge(100), '99+');
  assert.equal(candidateNotificationBadge(500), '99+');
});
test('all five screens use a common authenticated header notification entrypoint', () => {
  const layout = readFileSync(new URL('../src/app/(tabs)/_layout.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../src/components/CandidateHeaderNotification.tsx', import.meta.url), 'utf8');
  assert.match(layout, /headerRight:\s*\(\)\s*=>\s*<CandidateHeaderNotification\s*\/>/);
  assert.match(header, /router\.push\('\/\(tabs\)\/notifications'\)/);
  assert.match(header, /useNotifications\(\)/);
  assert.match(header, /usePrivateDataQuarantine\(\)/);
  assert.match(header, /privacy\.canAccessPrivateData\(\)/);
  assert.match(header, /candidateNotificationBadge\(privateAllowed\s*\?\s*unreadCount\s*:\s*null\)/);
  assert.doesNotMatch(header, /'99\+'\s*:\s*'0'/);
  for (const tab of ['home', 'jobs', 'career', 'saved', 'profile']) {
    assert.ok(layout.includes('<Tabs.Screen name="' + tab + '"'));
  }
});
