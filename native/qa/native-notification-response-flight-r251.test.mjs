import test from 'node:test';
import assert from 'node:assert/strict';
import { tryBeginNotificationResponse } from '../src/lib/notificationResponseFlight.ts';

test('two simultaneous OS deliveries acquire only one synchronous pre-await lease', async () => {
  const inFlight = new Set();
  let launchCount = 0;
  const replay = async () => {
    if (!tryBeginNotificationResponse(inFlight, 'synthetic-notification-A')) return;
    try {
      launchCount += 1;
      await Promise.resolve(); // stand-in scheduling boundary, not a fake API
    } finally {
      inFlight.delete('synthetic-notification-A');
    }
  };
  const a = replay();
  const b = replay();
  await Promise.all([a, b]);
  assert.equal(launchCount, 1);
  assert.deepEqual([...inFlight], []);
});

test('a distinct push can be acquired without blocking the first notification', () => {
  const inFlight = new Set();
  assert.equal(tryBeginNotificationResponse(inFlight, 'synthetic-A'), true);
  assert.equal(tryBeginNotificationResponse(inFlight, 'synthetic-B'), true);
  assert.equal(tryBeginNotificationResponse(inFlight, 'synthetic-A'), false);
});

test('invalid or missing identifier never starts a push response', () => {
  const inFlight = new Set();
  assert.equal(tryBeginNotificationResponse(inFlight, ''), false);
  assert.equal(inFlight.size, 0);
});

test('a failed or deferred attempt releases its lease and permits deliberate retry', async () => {
  const inFlight = new Set();
  assert.equal(tryBeginNotificationResponse(inFlight, 'synthetic-A'), true);
  try {
    throw new Error('simulated expired session before a write');
  } catch {
    // Keep the response pending, rather than acknowledging it.
  } finally {
    inFlight.delete('synthetic-A');
  }
  assert.equal(tryBeginNotificationResponse(inFlight, 'synthetic-A'), true);
});

test('existing notification list-card processing shares the same lease', () => {
  const inFlight = new Set(['synthetic-notification-A']);
  assert.equal(tryBeginNotificationResponse(inFlight, 'synthetic-notification-A'), false);
  inFlight.delete('synthetic-notification-A');
  assert.equal(tryBeginNotificationResponse(inFlight, 'synthetic-notification-A'), true);
});
