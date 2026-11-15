import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { candidateNotificationHeaderDisclosure } from '../src/lib/candidateNotificationHeaderBadge.ts';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

test('confirmed zero is a quiet bell, not a fabricated unread badge', () => {
  assert.deepEqual(candidateNotificationHeaderDisclosure(0), {
    accessibilityLabel: '通知', badgeText: null,
  });
});

test('canonical positive unread count is shown and announced', () => {
  assert.deepEqual(candidateNotificationHeaderDisclosure(3), {
    accessibilityLabel: '通知、未読3件', badgeText: '3',
  });
  assert.equal(candidateNotificationHeaderDisclosure(99).badgeText, '99');
});

test('badge is capped at 99+ without truncating accessible count', () => {
  assert.deepEqual(candidateNotificationHeaderDisclosure(145), {
    accessibilityLabel: '通知、未読145件', badgeText: '99+',
  });
});

test('unknown and malformed counts never masquerade as confirmed zero', () => {
  for (const value of [null, NaN, Infinity, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(candidateNotificationHeaderDisclosure(value), {
      accessibilityLabel: '通知、未読件数を確認できません', badgeText: null,
    });
  }
});

test('candidate header reads current private provider, not a global count or push payload', () => {
  const header = read('../src/components/CandidateNotificationHeaderAction.tsx');
  assert.match(header, /const \{ unreadCount \} = useNotifications\(\)/);
  assert.match(header, /candidateNotificationHeaderDisclosure\(unreadCount\)/);
  assert.match(header, /router\.push\('\/\(tabs\)\/notifications'\)/);
  assert.match(header, /accessibilityRole="button"/);
  assert.doesNotMatch(header, /getLastNotificationResponseAsync|link_url|notification\.request\.content/);
});

test('header action is wired without disturbing five confirmed Web tabs', () => {
  const layout = read('../src/app/(tabs)/_layout.tsx');
  assert.match(layout, /headerRight: \(\) => <CandidateNotificationHeaderAction \/>/);
  const active = [...layout.matchAll(/<Tabs\.Screen name="([^"]+)" options=\{\{(?![^\n]*href: null)/g)].map(m => m[1]);
  assert.deepEqual(active, ['home', 'jobs', 'career', 'saved', 'profile']);
  assert.match(layout, /name="applications" options=\{\{ href: null/);
  assert.match(layout, /name="notifications" options=\{\{ href: null/);
});
