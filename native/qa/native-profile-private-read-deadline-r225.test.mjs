import assert from 'node:assert/strict';
import test from 'node:test';
import { readCandidateProfileBounded } from '../src/lib/profileCanonicalRead.ts';

const pinFor = (owner = 'synthetic-A', session = 'session-1') => ({
  ownerId: owner,
  ownerSessionId: session,
  isCurrent: () => true,
});
function args(overrides = {}) {
  return {
    pin: async () => pinFor(),
    load: async () => ({ clerk_user_id: 'synthetic-A', name: '合成 太郎' }),
    isCurrent: () => true,
    ownsPin: (pinned) => pinned.ownerId === 'synthetic-A' && pinned.ownerSessionId === 'session-1',
    timeoutMs: 25,
    ...overrides,
  };
}

test('authorized synthetic candidate returns only canonical profile data', async () => {
  const result = await readCandidateProfileBounded(args());
  assert.equal(result.pinned.ownerId, 'synthetic-A');
  assert.deepEqual(result.profile, { clerk_user_id: 'synthetic-A', name: '合成 太郎' });
});

test('hanging Clerk token read expires without launching profile RPC', async () => {
  let reads = 0;
  await assert.rejects(readCandidateProfileBounded(args({
    pin: () => new Promise(() => {}),
    load: async () => { reads++; return { name: 'must not load' }; },
  })), /タイムアウト/);
  assert.equal(reads, 0);
});

test('hanging canonical profile RPC expires without reporting save or empty profile', async () => {
  let reads = 0;
  await assert.rejects(readCandidateProfileBounded(args({
    load: () => { reads++; return new Promise(() => {}); },
  })), /タイムアウト/);
  assert.equal(reads, 1);
});

test('revocation before the Clerk microtask prevents token request', async () => {
  let live = true;
  let pins = 0;
  const result = readCandidateProfileBounded(args({
    isCurrent: () => live,
    pin: async () => { pins++; return pinFor(); },
  }));
  live = false;
  await assert.rejects(result, /ログイン状態/);
  assert.equal(pins, 0);
});

test('a changed account is rejected before canonical profile RPC', async () => {
  let reads = 0;
  await assert.rejects(readCandidateProfileBounded(args({
    pin: async () => pinFor('synthetic-B', 'session-2'),
    load: async () => { reads++; return { name: 'unrelated' }; },
  })), /ログイン状態/);
  assert.equal(reads, 0);
});

test('same account with a replaced session cannot start canonical profile read', async () => {
  let reads = 0;
  await assert.rejects(readCandidateProfileBounded(args({
    pin: async () => pinFor('synthetic-A', 'session-2'),
    load: async () => { reads++; return { name: 'wrong session' }; },
  })), /ログイン状態/);
  assert.equal(reads, 0);
});

test('revocation between token resolution and network launch blocks the RPC', async () => {
  let live = true;
  let reads = 0;
  const result = readCandidateProfileBounded(args({
    ownsPin: (pinned) => {
      if (pinned.ownerId !== 'synthetic-A') return false;
      // First preflight is allowed, then screen blurs before queued read.
      if (live) { live = false; return true; }
      return false;
    },
    load: async () => { reads++; return { name: 'unrelated' }; },
  }));
  await assert.rejects(result, /ログイン状態/);
  assert.equal(reads, 0);
});

test('late canonical response cannot publish once the screen lease is revoked', async () => {
  let live = true;
  let finish;
  const result = readCandidateProfileBounded(args({
    isCurrent: () => live,
    load: () => new Promise(resolve => { finish = resolve; }),
  }));
  for (let n = 0; n < 10 && !finish; n++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finish, 'function');
  live = false;
  finish({ clerk_user_id: 'synthetic-A', name: 'stale' });
  await assert.rejects(result, /ログイン状態/);
});

test('late token resolution after timeout never launches a profile RPC', async () => {
  let finish;
  let reads = 0;
  const result = readCandidateProfileBounded(args({
    pin: () => new Promise(resolve => { finish = resolve; }),
    load: async () => { reads++; return { name: 'must not load' }; },
  }));
  await assert.rejects(result, /タイムアウト/);
  finish(pinFor());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
});

import { pinCandidateProfilePrewrite } from '../src/lib/profileCanonicalRead.ts';

test('profile save token timeout happens strictly before any write', async () => {
  let mutations = 0;
  async function saveProfile() {
    const pinned = await pinCandidateProfilePrewrite(() => new Promise(() => {}), () => true, 25);
    if (pinned) mutations++;
  }
  await assert.rejects(saveProfile(), /タイムアウト/);
  assert.equal(mutations, 0);
});

test('profile save token late response cannot start an upsert after deadline', async () => {
  let finish;
  let mutations = 0;
  const operation = (async () => {
    const pinned = await pinCandidateProfilePrewrite(() => new Promise(resolve => {finish = resolve;}), () => true, 25);
    if (pinned) mutations++;
  })();
  await assert.rejects(operation, /タイムアウト/);
  finish(pinFor());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mutations, 0);
});

test('profile save pin revocation forbids a write', async () => {
  let live = true;
  let mutations = 0;
  const op = (async () => {
    const pinned = await pinCandidateProfilePrewrite(async () => pinFor(), () => live, 25);
    if (pinned) mutations++;
  })();
  live = false;
  await assert.rejects(op, /ログイン状態/);
  assert.equal(mutations, 0);
});
