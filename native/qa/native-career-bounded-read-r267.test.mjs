import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedPrivateRead } from '../src/lib/privateReadDeadline.ts';
import { pinCandidateForRead } from '../src/lib/pinnedCandidateRead.ts';
import { mayPresentCareerReadFailure } from '../src/lib/careerReadPreflight.ts';

const ownerA = '["candidate-a","session-1"]';
const ownerB = '["candidate-b","session-2"]';
const pinned = () => ({ isCurrent: () => true, client: { fixture: true } });
const never = () => new Promise(() => {});

test('bounded Clerk preflight rejects a hung token without starting any canonical read', async () => {
  let canonicalCalls = 0;
  await assert.rejects(async () => {
    const lease = await pinCandidateForRead(never, () => true, 10);
    canonicalCalls++;
    await boundedPrivateRead(() => Promise.resolve(lease.client), 10);
  }, /タイムアウト/);
  assert.equal(canonicalCalls, 0);
});

test('token timeout can be retried and launches exactly one authorized read', async () => {
  let starts = 0;
  await assert.rejects(pinCandidateForRead(never, () => true, 10));
  const lease = await pinCandidateForRead(async () => { starts++; return pinned(); }, () => true, 20);
  const result = await boundedPrivateRead(async () => lease.client.fixture, 20);
  assert.equal(starts, 1);
  assert.equal(result, true);
});

test('a switched session rejects an earlier token before any private RPC', async () => {
  let currentOwner = ownerA;
  let releaseToken;
  let readStarted = false;
  const pending = pinCandidateForRead(() => new Promise(resolve => { releaseToken = resolve; }),
    () => currentOwner === ownerA, 50);
  await Promise.resolve(); await Promise.resolve();
  currentOwner = ownerB;
  releaseToken(pinned());
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(readStarted, false);
  assert.equal(mayPresentCareerReadFailure(ownerA, currentOwner, 2, 2, true), false);
});

test('App Lock during token preflight suppresses private error presentation', async () => {
  let unlocked = true;
  const pending = pinCandidateForRead(() => new Promise(() => {}), () => unlocked, 10);
  unlocked = false;
  await assert.rejects(pending);
  assert.equal(mayPresentCareerReadFailure(ownerA, ownerA, 3, 3, unlocked), false);
});

test('base profile, preferences and conditions are individually bounded', async () => {
  const responses = await Promise.allSettled([
    boundedPrivateRead(async () => ({ current_monthly_salary: 200000 }), 20),
    boundedPrivateRead(never, 10),
    boundedPrivateRead(async () => ({ prefecture: '東京' }), 20),
  ]);
  assert.deepEqual(responses.map(r => r.status), ['fulfilled','rejected','fulfilled']);
  assert.match(responses[1].reason.message, /タイムアウト/);
});

test('market parallel reads preserve successful sections when one RPC times out', async () => {
  const displayed = {};
  const read = async (key, op) => {
    try { displayed[key] = { status: 'ready', data: await boundedPrivateRead(op, 15) }; }
    catch { displayed[key] = { status: 'error' }; }
  };
  await Promise.all([
    read('posted', async () => ({ count: 4 })),
    read('official', never),
    read('holiday', async () => ({ count: 3 })),
  ]);
  assert.deepEqual(displayed, {
    posted: { status: 'ready', data: { count: 4 } },
    holiday: { status: 'ready', data: { count: 3 } },
    official: { status: 'error' },
  });
});

test('scenario and detailed read deadlines reject a hung RPC without a write', async () => {
  let writes = 0;
  await assert.rejects(boundedPrivateRead(never, 10));
  await assert.rejects(boundedPrivateRead(never, 10));
  assert.equal(writes, 0);
});

test('late canonical read resolution cannot override the bounded rejection', async () => {
  let resolve;
  const result = boundedPrivateRead(() => new Promise(r => { resolve = r; }), 10);
  await assert.rejects(result, /タイムアウト/);
  resolve({ secret: 'synthetic-only' });
  await Promise.resolve();
});

test('late canonical read rejection is observed after deadline', async () => {
  let reject;
  const result = boundedPrivateRead(() => new Promise((_, r) => { reject = r; }), 10);
  await assert.rejects(result, /タイムアウト/);
  reject(new Error('backend private id never display'));
  await Promise.resolve();
});

test('an already expired screen never starts token fetch', async () => {
  let count = 0;
  await assert.rejects(pinCandidateForRead(async () => { count++; return pinned(); }, () => false, 20), /ログイン状態/);
  assert.equal(count, 0);
});
