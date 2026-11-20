import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationCanonicalReadFlight } from '../src/lib/notificationCanonicalReadFlight.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const request = (ownerKey, execute, intent = 'quiet', isCurrent = () => true) => ({ ownerKey, execute, intent, isCurrent });

test('two same-session quiet reloads perform one canonical operation', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const job = deferred();
  let calls = 0;
  const run = () => flight.read(request('A:session1', async () => { calls++; await job.promise; }));
  const first = run(), second = run();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  job.resolve();
  await Promise.all([first, second]);
});

test('fresh request after an existing read starts another read in order', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const original = deferred();
  let active = 0, maximum = 0, started = 0;
  const work = async () => { started++; active++; maximum = Math.max(maximum, active); if(started === 1) await original.promise; active--; };
  const first = flight.read(request('A:session1', work));
  const second = flight.read(request('A:session1', work, 'fresh'));
  await Promise.resolve();
  assert.equal(started, 1);
  original.resolve();
  await Promise.all([first, second]);
  assert.equal(started, 2);
  assert.equal(maximum, 1);
});

test('multiple fresh requests after same pending read join the one subsequent read', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const blocker = deferred();
  let count = 0;
  const work = async () => { count++; if(count === 1) await blocker.promise; };
  const first = flight.read(request('A:s', work));
  const a = flight.read(request('A:s', work, 'fresh'));
  const b = flight.read(request('A:s', work, 'fresh'));
  blocker.resolve();
  await Promise.all([first, a, b]);
  assert.equal(count, 2);
});

test('failed old read does not skip explicit fresh retry', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const blocker = deferred();
  let count = 0;
  const work = async () => { count++; if(count === 1) await blocker.promise; };
  const first = flight.read(request('A:s', work));
  const fresh = flight.read(request('A:s', work, 'fresh'));
  blocker.reject(new Error('RPC failed'));
  await assert.rejects(first, /RPC failed/);
  await fresh;
  assert.equal(count, 2);
});

test('expired session revokes queued fresh read without issuing RPC', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const blocker = deferred();
  let allowed = true, count = 0;
  const work = async () => { count++; await blocker.promise; };
  const first = flight.read(request('A:s', work));
  const fresh = flight.read(request('A:s', work, 'fresh', () => allowed));
  await Promise.resolve();
  allowed = false;
  blocker.resolve();
  await first;
  await assert.rejects(fresh, /SESSION_CHANGED/);
  assert.equal(count, 1);
});

test('privacy epoch change rejects queued read even if same account unlocks again', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const blocker = deferred();
  let epoch = 9, count = 0;
  const work = async () => { count++; if(count === 1) await blocker.promise; };
  const first = flight.read(request('A:s', work));
  const savedEpoch = epoch;
  const fresh = flight.read(request('A:s', work, 'fresh', () => epoch === savedEpoch));
  await Promise.resolve();
  epoch = 11; // shield locked and unlocked; owner string unchanged
  blocker.resolve();
  await first;
  await assert.rejects(fresh, /SESSION_CHANGED/);
  assert.equal(count, 1);
});

test('different account does not join other owner pending read', async () => {
  const flight = createNotificationCanonicalReadFlight();
  const blocker = deferred();
  let a = 0, b = 0;
  const old = flight.read(request('A:s', async () => { a++; await blocker.promise; }));
  const newer = flight.read(request('B:s', async () => { b++; }));
  await newer;
  blocker.resolve();
  await old;
  assert.deepEqual([a,b], [1,1]);
});

test('completed run releases flight for a later same-owner quiet refresh', async () => {
  const flight = createNotificationCanonicalReadFlight();
  let count = 0;
  const work = async () => { count++; };
  await flight.read(request('A:s', work));
  await flight.read(request('A:s', work));
  assert.equal(count, 2);
});

test('no owner or closed privacy gate never invokes canonical read', async () => {
  const flight = createNotificationCanonicalReadFlight();
  let count = 0;
  const work = async () => { count++; };
  await assert.rejects(flight.read(request(null, work)), /SESSION_CHANGED/);
  await assert.rejects(flight.read(request('A:s', work, 'fresh', () => false)), /SESSION_CHANGED/);
  assert.equal(count, 0);
});
