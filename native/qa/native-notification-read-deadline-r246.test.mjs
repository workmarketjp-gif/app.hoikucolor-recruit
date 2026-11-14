import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPrivateRead } from '../src/lib/privateReadDeadline.ts';
import { resolveCanonicalNotificationRead } from '../src/lib/notificationReadSnapshot.ts';

test('perpetually pending notification-list read fails with recovery deadline, no fabricated empty list', async () => {
  let attempts = 0;
  await assert.rejects(boundedPrivateRead(() => { attempts++; return new Promise(() => {}); }, 5),
    { message: '通信がタイムアウトしました。再読み込みしてください。' });
  assert.equal(attempts, 1);
});

test('bounded pre-read auth pin accepts success and never auto-retries after timeout', async () => {
  assert.equal(await boundedPrivateRead(async () => 'synthetic-owner', 250), 'synthetic-owner');
  let attempts = 0;
  await assert.rejects(boundedPrivateRead(() => { attempts++; return new Promise(() => {}); }, 5),
    /タイムアウト/);
  assert.equal(attempts, 1);
});

test('late successful RPC result is observed but not used by the expired bounded promise', async () => {
  let finish;
  const read = boundedPrivateRead(() => new Promise((resolve) => { finish = resolve; }), 5);
  await assert.rejects(read, /タイムアウト/);
  finish([{ id: 'synthetic-late-row' }]);
  await Promise.resolve();
  await assert.rejects(read, /タイムアウト/);
});

test('independent count timeout preserves a verified list and unknown count', async () => {
  const [rows, count, attention] = await Promise.allSettled([
    boundedPrivateRead(async () => [{id:'synthetic-row'}], 50),
    boundedPrivateRead(() => new Promise(() => {}), 5),
    boundedPrivateRead(async () => ({}), 50),
  ]);
  const snapshot = resolveCanonicalNotificationRead(rows, count, attention);
  assert.equal(snapshot.notifications[0].id, 'synthetic-row');
  assert.equal(snapshot.unreadCount, null);
  assert.ok(snapshot.warning);
});
