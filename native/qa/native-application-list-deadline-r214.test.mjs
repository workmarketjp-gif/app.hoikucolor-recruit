import test from 'node:test';
import assert from 'node:assert/strict';
import { readCandidateApplicationIndex } from '../src/lib/candidateApplicationIndexRead.ts';

const ownerA = '["candidate-a","session-a"]';
const ownerB = '["candidate-b","session-b"]';
const key = (user, session) => JSON.stringify([user, session]);
const pin = (extra = {}) => ({
  client: Object.freeze({ name: 'synthetic-scoped-client' }),
  ownerId: 'candidate-a', ownerSessionId: 'session-a', isCurrent: () => true, ...extra,
});
const setup = (extra = {}) => ({
  pin: async () => pin(), list: async () => ['authorized synthetic application'],
  expectedOwnerKey: ownerA, resolveOwnerKey: key, isActive: () => true, timeoutMs: 20,
  ...extra,
});

test('confirmed candidate receives only the exact canonical list response', async () => {
  const rows = ['synthetic-1', 'synthetic-2'];
  let calls = 0;
  const actual = await readCandidateApplicationIndex(setup({ list: async (client) => {
    calls++; assert.equal(client.name, 'synthetic-scoped-client'); return rows;
  } }));
  assert.equal(actual.ownerKey, ownerA);
  assert.equal(actual.rows, rows);
  assert.equal(calls, 1);
});

test('replaced account/session blocks the application RPC before it begins', async () => {
  let calls = 0;
  await assert.rejects(readCandidateApplicationIndex(setup({
    pin: async () => pin({ ownerSessionId: 'session-b' }),
    list: async () => { calls++; return []; },
  })), /ログイン状態/);
  assert.equal(calls, 0);
  assert.notEqual(ownerB, ownerA);
});

test('null or revoked pin cannot launch the candidate list read', async () => {
  for (const candidatePin of [null, pin({ isCurrent: () => false })]) {
    let calls = 0;
    await assert.rejects(readCandidateApplicationIndex(setup({
      pin: async () => candidatePin,
      list: async () => { calls++; return []; },
    })), /ログイン状態/);
    assert.equal(calls, 0);
  }
});

test('App Lock before the token microtask prevents token acquisition', async () => {
  let calls = 0;
  await assert.rejects(readCandidateApplicationIndex(setup({
    isActive: () => false,
    pin: async () => { calls++; return pin(); },
  })), /閲覧状態/);
  assert.equal(calls, 0);
});

test('App Lock after token acquisition but before list read prevents RPC', async () => {
  let active = true;
  let calls = 0;
  await assert.rejects(readCandidateApplicationIndex(setup({
    pin: async () => { active = false; return pin(); },
    isActive: () => active,
    list: async () => { calls++; return []; },
  })), /ログイン状態/);
  assert.equal(calls, 0);
});

test('revoked focus while list read is pending blocks result publication', async () => {
  let active = true;
  await assert.rejects(readCandidateApplicationIndex(setup({
    list: async () => { active = false; return ['old candidate item']; },
    isActive: () => active,
  })), /閲覧状態/);
});

test('hung token and hung list independently time out without automatic retry', async () => {
  let tokenCalls = 0;
  await assert.rejects(readCandidateApplicationIndex(setup({
    pin: async () => { tokenCalls++; return new Promise(() => {}); },
    timeoutMs: 8,
  })), /タイムアウト/);
  assert.equal(tokenCalls, 1);

  let listCalls = 0;
  await assert.rejects(readCandidateApplicationIndex(setup({
    list: async () => { listCalls++; return new Promise(() => {}); }, timeoutMs: 8,
  })), /タイムアウト/);
  assert.equal(listCalls, 1);
});

test('late token rejection and late list resolution do not surface as success', async () => {
  let rejectPin;
  let resolveList;
  const p1 = readCandidateApplicationIndex(setup({
    pin: () => new Promise((resolve, reject) => { rejectPin = reject; }), timeoutMs: 7,
  }));
  await assert.rejects(p1, /タイムアウト/);
  rejectPin(new Error('late token failure'));

  const p2 = readCandidateApplicationIndex(setup({
    list: () => new Promise((resolve) => { resolveList = resolve; }), timeoutMs: 7,
  }));
  await assert.rejects(p2, /タイムアウト/);
  resolveList(['late private data']);
});

test('canonical list transport failure propagates and is never treated as empty', async () => {
  await assert.rejects(readCandidateApplicationIndex(setup({
    list: async () => { throw new Error('canonical server denied'); },
  })), /canonical server denied/);
});
