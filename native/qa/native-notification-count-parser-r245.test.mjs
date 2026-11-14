import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCanonicalUnreadNotificationCount,
  resolveCanonicalNotificationRead,
} from '../src/lib/notificationReadSnapshot.ts';
import {
  candidateNotificationCountPresentation,
  candidateNotificationEmptyPresentation,
} from '../src/lib/notificationListPresentation.ts';

const fulfilled = (value) => ({ status: 'fulfilled', value });
const rejected = (reason) => ({ status: 'rejected', reason });
const invalidValues = [null, undefined, false, true, '', ' ', ' 0 ', '01', '-1', '+1', '1e3', '1.5',
  1.5, -1, NaN, Infinity, -Infinity, 9007199254740992, '9007199254740992', {}, [], ['0']];

test('canonical integer and decimal-string counts are accepted without rounding', () => {
  for (const [raw, expected] of [[0, 0], ['0', 0], [1, 1], ['1', 1], [100, 100], ['100', 100],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER]]) {
    assert.equal(parseCanonicalUnreadNotificationCount(raw), expected);
  }
});
test('null, missing, noncanonical and unsafe count values never become a false zero', () => {
  for (const raw of invalidValues) {
    assert.throws(() => parseCanonicalUnreadNotificationCount(raw),
      { message: 'NOTIFICATION_UNREAD_COUNT_UNAVAILABLE' }, 'invalid raw count must reject');
  }
});
test('unknown unread count keeps verified notification rows but never confirms empty or all-read', () => {
  const rows = [{ id: 'synthetic-notification', read_at: null }];
  const state = resolveCanonicalNotificationRead(fulfilled(rows), rejected(Error('synthetic count RPC null')),
    fulfilled({}));
  assert.deepEqual(state.notifications, rows);
  assert.equal(state.unreadCount, null);
  assert.ok(state.warning);
  assert.equal(candidateNotificationCountPresentation({ loaded: true, loading: false, hasCanonicalError: true,
    visibleCount: 1, visibleUnreadCount: 1, unreadCount: state.unreadCount }).kind, 'unavailable');
  assert.equal(candidateNotificationEmptyPresentation({ loaded: true, loading: false, hasCanonicalError: true,
    visibleCount: 0, unreadCount: state.unreadCount }), 'hidden');
});
test('genuine zero remains a confirmed empty, but unknown never appears as zero', () => {
  const result = resolveCanonicalNotificationRead(fulfilled([]), fulfilled(parseCanonicalUnreadNotificationCount('0')),
    fulfilled({}));
  assert.equal(result.warning, null);
  assert.equal(candidateNotificationEmptyPresentation({ loaded: true, loading: false, hasCanonicalError: false,
    visibleCount: 0, unreadCount: result.unreadCount }), 'confirmed_empty');
});
