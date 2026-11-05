import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveCanonicalNotificationRead } from '../src/lib/notificationReadSnapshot.ts';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView } from '../src/lib/candidateViewOwner.ts';

const ok = (value) => ({ status: 'fulfilled', value });
const failed = (message) => ({ status: 'rejected', reason: new Error(message) });
const a = candidateViewOwnerKey('synthetic-A', 'session-1');
const b = candidateViewOwnerKey('synthetic-B', 'session-1');
const sameAccountNewSession = candidateViewOwnerKey('synthetic-A', 'session-2');
const row = { id: 'synthetic-notice-A', title: '検証用通知' };

test('fully successful canonical read keeps exact rows, count and attention', () => {
  assert.deepEqual(resolveCanonicalNotificationRead(ok([row]), ok(3), ok({ unread_messages_count: 2 })), {
    notifications: [row], unreadCount: 3, attentionSummary: { unread_messages_count: 2 }, warning: null,
  });
});
test('successful confirmed empty and zero are distinct from unverified', () => {
  assert.deepEqual(resolveCanonicalNotificationRead(ok([]), ok(0), ok({ unread_messages_count: 0 })).notifications, []);
  assert.equal(resolveCanonicalNotificationRead(ok([]), ok(0), ok({})).unreadCount, 0);
});
test('failed list cannot be presented as empty or partially updated', () => {
  assert.throws(() => resolveCanonicalNotificationRead(failed('403 unauthorized'), ok(0), ok({})), /403 unauthorized/);
});
test('failed count remains unknown while verified list is shown', () => {
  const result = resolveCanonicalNotificationRead(ok([row]), failed('timeout'), ok({ unread_messages_count: 1 }));
  assert.equal(result.unreadCount, null);
  assert.deepEqual(result.notifications, [row]);
  assert.ok(result.warning);
});
test('failed attention remains unknown rather than reporting zero actions', () => {
  const result = resolveCanonicalNotificationRead(ok([row]), ok(2), failed('403'));
  assert.equal(result.attentionSummary, null);
  assert.ok(result.warning);
});
test('simultaneous auxiliary failures retain rows without fabricated totals', () => {
  const result = resolveCanonicalNotificationRead(ok([]), failed('count'), failed('attention'));
  assert.equal(result.unreadCount, null);
  assert.equal(result.attentionSummary, null);
});
test('private read lease blocks App Lock, unchanged-session unlock and account switch', () => {
  const current = { ownerKey: a, value: resolveCanonicalNotificationRead(ok([row]), ok(1), ok({})) };
  assert.equal(readCandidateFreshlyVerifiedView(current, a, false, a), null);
  assert.equal(readCandidateFreshlyVerifiedView(current, a, true, null), null);
  assert.equal(readCandidateFreshlyVerifiedView(current, b, true, b), null);
  assert.equal(readCandidateFreshlyVerifiedView(current, sameAccountNewSession, true, sameAccountNewSession), null);
  assert.equal(readCandidateFreshlyVerifiedView(current, a, true, a)?.notifications[0]?.id, row.id);
});
test('real provider and screens enforce read lease and avoid unknown-to-zero UX', () => {
  const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
  const context = read('../src/contexts/NotificationContext.tsx');
  const screen = read('../src/app/(tabs)/notifications.tsx');
  const home = read('../src/app/(tabs)/home.tsx');
  assert.match(context, /readCandidateFreshlyVerifiedView\(/);
  assert.match(context, /candidateViewOwnerKey\(/);
  assert.match(context, /resolveCanonicalNotificationRead\(/);
  assert.match(context, /verificationRef\.current = null/);
  assert.match(context, /if \(!pinned\.isCurrent\(\) \|\| generation !== canonicalLoadGeneration\.current\)/);
  assert.match(context, /const safeSnapshot = readCandidateFreshlyVerifiedView/);
  assert.match(screen, /notifications\.unreadCount === null \? '未読件数を確認できません' :/);
  assert.match(screen, /notifications\.error/);
  assert.match(screen, /notifications\.loaded/);
  assert.match(home, /value == null \? '—' : value/);
  assert.doesNotMatch(screen, /unreadCount \?\? 0/);
});
