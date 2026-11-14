import assert from 'node:assert/strict';
import test from 'node:test';
import { readCandidateJobDiscoveryBounded } from '../src/lib/jobDiscoveryCanonicalRead.ts';

const pin = (owner = 'synthetic-candidate-A', session = 'synthetic-session-A', live = () => true) => ({
  ownerId: owner, ownerSessionId: session, isCurrent: live,
});
const options = (patch = {}) => ({
  pin: async () => pin(),
  read: async () => ({ jobs: [], totalCount: 0, hasMore: false }),
  isCurrent: () => true,
  ownsPin: (p) => p.ownerId === 'synthetic-candidate-A' && p.ownerSessionId === 'synthetic-session-A',
  timeoutMs: 20,
  ...patch,
});

test('a current session returns canonical search data without fabricating counts', async () => {
  const raw = { jobs: [{ id: 'synthetic-job' }], totalCount: 15, hasMore: true };
  const actual = await readCandidateJobDiscoveryBounded(options({ read: async () => raw }));
  assert.equal(actual.value, raw);
  assert.equal(actual.pinned.ownerId, 'synthetic-candidate-A');
});

test('pending Clerk token times out before any canonical RPC', async () => {
  let rpc = 0;
  await assert.rejects(readCandidateJobDiscoveryBounded(options({
    pin: () => new Promise(() => {}),
    read: async () => { rpc++; return []; },
  })), /タイムアウト/);
  assert.equal(rpc, 0);
});

test('pending canonical search/facets read times out instead of a false empty result', async () => {
  let rpc = 0;
  await assert.rejects(readCandidateJobDiscoveryBounded(options({
    read: () => { rpc++; return new Promise(() => {}); },
  })), /タイムアウト/);
  assert.equal(rpc, 1);
});

test('rejected canonical read propagates an error, never an empty jobs list', async () => {
  await assert.rejects(readCandidateJobDiscoveryBounded(options({
    read: async () => { throw new Error('synthetic network failure'); },
  })), /synthetic network failure/);
});

test('owner or session mismatch blocks private network I/O', async () => {
  let rpc = 0;
  for (const p of [pin('synthetic-candidate-B'), pin('synthetic-candidate-A', 'synthetic-session-B')]) {
    await assert.rejects(readCandidateJobDiscoveryBounded(options({
      pin: async () => p,
      read: async () => { rpc++; return []; },
    })), /ログイン状態/);
  }
  assert.equal(rpc, 0);
});

test('a revoked generation blocks Clerk token request before microtask I/O', async () => {
  let live = true;
  let pins = 0;
  const request = readCandidateJobDiscoveryBounded(options({
    isCurrent: () => live,
    pin: async () => { pins++; return pin(); },
  }));
  live = false;
  await assert.rejects(request, /ログイン状態/);
  assert.equal(pins, 0);
});

test('revocation between the pin check and read microtask blocks the RPC', async () => {
  let live = true;
  let rpc = 0;
  const request = readCandidateJobDiscoveryBounded(options({
    ownsPin: () => { if (live) { live = false; return true; } return false; },
    read: async () => { rpc++; return []; },
  }));
  await assert.rejects(request, /ログイン状態/);
  assert.equal(rpc, 0);
});

test('a revoked owner cannot publish a late canonical response', async () => {
  let live = true;
  let finish;
  const request = readCandidateJobDiscoveryBounded(options({
    isCurrent: () => live,
    read: () => new Promise((resolve) => { finish = resolve; }),
  }));
  for (let n = 0; n < 12 && !finish; n++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof finish, 'function');
  live = false;
  finish({ jobs: ['stale'] });
  await assert.rejects(request, /ログイン状態/);
});

test('late token resolution after deadline never starts a canonical RPC', async () => {
  let finish;
  let rpc = 0;
  const request = readCandidateJobDiscoveryBounded(options({
    pin: () => new Promise((resolve) => { finish = resolve; }),
    read: async () => { rpc++; return []; },
  }));
  await assert.rejects(request, /タイムアウト/);
  finish(pin());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(rpc, 0);
});
