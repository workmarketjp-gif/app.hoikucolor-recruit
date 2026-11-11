import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateProfileTabBadge } from '../src/lib/candidateProfileTabBadge.ts';

const attention = (unread_messages_count, unanswered_interviews_count, pending_scouts_count = 50) => ({
  unread_messages_count, unanswered_interviews_count, pending_scouts_count,
});

test('one unread message and two unanswered interviews give Web My Page count 3', () => {
  assert.deepEqual(candidateProfileTabBadge(attention(1, 2)), {
    badge: 3, accessibilityLabel: 'マイページ、未確認 3 件',
  });
});

test('scouts, push unread and other task counts do not inflate the My Page badge', () => {
  assert.deepEqual(candidateProfileTabBadge(attention(0, 0, 50)), {
    badge: undefined, accessibilityLabel: 'マイページ',
  });
});

test('Web caps the badge at 99+ without losing the accurate accessible total', () => {
  assert.deepEqual(candidateProfileTabBadge(attention(70, 30)), {
    badge: '99+', accessibilityLabel: 'マイページ、未確認 100 件',
  });
  assert.equal(candidateProfileTabBadge(attention(99, 0)).badge, 99);
});

test('locked, logged-out, unavailable or invalid canonical attention never fabricates a count', () => {
  for (const candidate of [null, attention(-1, 3), attention(NaN, 2),
    attention(1.5, 2), attention(Infinity, 0), attention(undefined, 2),
    attention(Number.MAX_SAFE_INTEGER, 1)]) {
    assert.deepEqual(candidateProfileTabBadge(candidate), {
      badge: undefined, accessibilityLabel: 'マイページ',
    });
  }
});
