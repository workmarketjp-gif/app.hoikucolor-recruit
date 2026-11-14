import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCanonicalNotificationRows,
  resolveCanonicalNotificationRead,
} from '../src/lib/notificationReadSnapshot.ts';
import { candidateNotificationEmptyPresentation } from '../src/lib/notificationListPresentation.ts';

const base = Object.freeze({
  id: '3a79d4e0-4fe1-4bd5-b4c0-2b1fb71b1761',
  application_id: null,
  notification_type: 'message_received',
  title: 'テスト用の通知',
  body: '本文',
  link_url: null,
  read_at: null,
  created_at: '2026-11-15T00:00:00Z',
});
const failList = (raw) => assert.throws(() => parseCanonicalNotificationRows(raw), {
  message: 'NOTIFICATION_LIST_UNAVAILABLE',
});
const ok = (value) => ({ status: 'fulfilled', value });
const bad = (reason) => ({ status: 'rejected', reason });

test('genuine array empty is not confused with null or failed canonical list', () => {
  assert.deepEqual(parseCanonicalNotificationRows([]), []);
  for (const input of [null, undefined, 0, '', false, {}, { rows: [] }, '[]']) failList(input);
  const snapshot = resolveCanonicalNotificationRead(ok(parseCanonicalNotificationRows([])), ok(0), ok({}));
  assert.equal(candidateNotificationEmptyPresentation({loaded:true, loading:false, hasCanonicalError:false,
    visibleCount:snapshot.notifications.length, unreadCount:snapshot.unreadCount}), 'confirmed_empty');
  assert.throws(() => resolveCanonicalNotificationRead(bad(new Error('NOTIFICATION_LIST_UNAVAILABLE')),
    ok(0), ok({})), /NOTIFICATION_LIST_UNAVAILABLE/);
});

test('valid canonical rows retain identities, timestamps and unread state', () => {
  const source = [base, { ...base, id: 'different', read_at: '2026-11-15T01:00:00Z', link_url: '/visits' }];
  assert.equal(parseCanonicalNotificationRows(source), source);
  assert.equal(parseCanonicalNotificationRows(source)[0].read_at, null);
  assert.equal(parseCanonicalNotificationRows(source)[1].read_at, '2026-11-15T01:00:00Z');
});

test('invalid row cannot hide notices or fabricate their read status', () => {
  for (const entry of [null, undefined, [], 'text', 5, {}]) failList([entry]);
  for (const patch of [
    { id: '' }, { id: null }, { application_id: undefined }, { application_id: 1 },
    { notification_type: undefined }, { notification_type: '' },
    { title: null }, { body: null }, { link_url: false },
    { read_at: undefined }, { read_at: false },
    { created_at: null }, { created_at: '' },
  ]) failList([{...base, ...patch}]);
});

test('malformed row anywhere rejects entire snapshot without filtering', () => {
  failList([base, {...base, id:'bad-row', read_at: { date: '2026-11-15' }}]);
  failList([base, { ...base }]); // duplicate keys must not show misleading unread count
  const valid = parseCanonicalNotificationRows([base]);
  assert.equal(resolveCanonicalNotificationRead(ok(valid), ok(1), ok({})).notifications.length, 1);
});
