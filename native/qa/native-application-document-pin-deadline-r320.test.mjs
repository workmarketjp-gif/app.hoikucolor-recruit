import test from 'node:test';
import assert from 'node:assert/strict';
import { pinForApplicationMutation } from '../src/lib/applicationMutationPin.ts';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const sleep = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
const pinned = (isCurrent = () => true) => ({
  client: { synthetic: true }, ownerId: 'candidate-A', ownerSessionId: 'session-A', isCurrent,
});

// These are synthetic Clerk responses, never real application/document writes.
// The imported helper is the exact production source, not a mocked module.
test('r320: an active owned document submission pins the session once before write eligibility', async () => {
  let pinCalls = 0;
  const result = await pinForApplicationMutation(async () => { pinCalls++; return pinned(); }, () => true, 50);
  assert.equal(pinCalls, 1);
  assert.equal(result.ownerId, 'candidate-A');
});

test('r320: a lost presentation lease before token retrieval cannot start a Clerk request', async () => {
  let pinCalls = 0;
  await assert.rejects(pinForApplicationMutation(async () => { pinCalls++; return pinned(); }, () => false, 50), /ログイン状態/);
  assert.equal(pinCalls, 0);
});

test('r320: a blurred route between start and microtask cannot request a token', async () => {
  let active = true; let pinCalls = 0;
  const attempt = pinForApplicationMutation(async () => { pinCalls++; return pinned(); }, () => active, 50);
  active = false;
  await assert.rejects(attempt, /ログイン状態/);
  assert.equal(pinCalls, 0);
});

test('r320: a hung Clerk token has a finite deadline; late success never reaches the caller', async () => {
  const response = deferred();
  let writeCount = 0;
  const attempt = pinForApplicationMutation(() => response.promise, () => true, 10)
    .then(() => { writeCount++; });
  await assert.rejects(attempt, /タイムアウト/);
  response.resolve(pinned());
  await sleep();
  assert.equal(writeCount, 0);
});

test('r320: a late token rejection after timeout is observed without starting a write', async () => {
  const response = deferred(); let writeCount = 0;
  const attempt = pinForApplicationMutation(() => response.promise, () => true, 10)
    .then(() => { writeCount++; });
  await assert.rejects(attempt, /タイムアウト/);
  response.reject(new Error('synthetic expired authentication'));
  await sleep();
  assert.equal(writeCount, 0);
});

test('r320: logout or account change during token acquisition prevents later document submission', async () => {
  const response = deferred(); let active = true; let writeCount = 0;
  const attempt = pinForApplicationMutation(() => response.promise, () => active, 50)
    .then(() => { writeCount++; });
  await sleep(1); active = false; response.resolve(pinned());
  await assert.rejects(attempt, /ログイン状態/);
  assert.equal(writeCount, 0);
});

test('r320: revoked pinned Clerk session and missing authentication both fail closed', async () => {
  await assert.rejects(pinForApplicationMutation(async () => pinned(() => false), () => true, 50), /ログイン状態/);
  await assert.rejects(pinForApplicationMutation(async () => null, () => true, 50), /ログイン状態/);
});
