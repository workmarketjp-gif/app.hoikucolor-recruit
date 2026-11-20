import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationCanonicalReadFlight } from '../src/lib/notificationCanonicalReadFlight.ts';

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

const read = (flight, privacyEpoch, execute, intent = 'quiet', ownerKey = 'candidateA:clerkSession1') =>
  flight.read({ ownerKey, privacyEpoch, intent, isCurrent: () => true, execute });

test('post-unlock quiet read starts independently of older same-owner in-flight read', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const blocker = deferred();
  let oldReads = 0;
  let newReads = 0;
  const old = read(flight, 17, async () => { oldReads++; await blocker.promise; });
  await Promise.resolve();
  const unlocked = read(flight, 19, async () => { newReads++; });
  await Promise.resolve();
  // The former behavior returned the old in-flight promise for both requests.
  assert.equal(newReads, 1);
  blocker.resolve();
  await Promise.all([old, unlocked]);
  assert.equal(oldReads, 1);
});

test('same-owner same-epoch quiet invalidations still coalesce', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const blocker = deferred();
  let count = 0;
  const run = () => read(flight, 4, async () => { count++; await blocker.promise; });
  const first = run();
  const second = run();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(count, 1);
  blocker.resolve();
  await Promise.all([first, second]);
});

test('stale prior-epoch completion cannot evict the newer epoch flight', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const oldBlocker = deferred(), freshBlocker = deferred();
  let calls = 0;
  const old = read(flight, 7, async () => { await oldBlocker.promise; });
  await Promise.resolve();
  const newer = read(flight, 8, async () => { calls++; await freshBlocker.promise; });
  await Promise.resolve();
  assert.equal(calls, 1);
  oldBlocker.resolve();
  await old;
  const joined = read(flight, 8, async () => { calls++; });
  assert.equal(joined, newer);
  freshBlocker.resolve();
  await Promise.all([newer, joined]);
  assert.equal(calls, 1);
});

test('new-epoch first read remains gated on the current private owner', async () => {
  const flight = createNotificationCanonicalReadFlight();
  let executed = 0;
  await assert.rejects(flight.read({ ownerKey: 'A:s', privacyEpoch: 9,
    intent: 'quiet', isCurrent: () => false,
    execute: async () => { executed++; },
  }), /SESSION_CHANGED/);
  assert.equal(executed, 0);
});
