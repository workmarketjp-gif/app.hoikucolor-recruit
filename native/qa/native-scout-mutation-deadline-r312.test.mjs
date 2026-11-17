import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedScoutMutationAcknowledgement } from '../src/lib/scoutMutationDeadline.ts';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('one successful pending Scout response returns its actual server acknowledgement', async () => {
  let sends = 0;
  const result = await boundedScoutMutationAcknowledgement(async () => {
    sends++;
    return 'accepted';
  }, () => true, 100);
  assert.equal(result, 'accepted');
  assert.equal(sends, 1);
});

test('lost candidate session before launch prevents any mutation', async () => {
  let sends = 0;
  await assert.rejects(() => boundedScoutMutationAcknowledgement(async () => {
    sends++;
    return 'accepted';
  }, () => false, 100), /ログイン状態/);
  assert.equal(sends, 0);
});

test('session loss before deferred mutation launch does not call backend', async () => {
  let current = true;
  let sends = 0;
  const pending = boundedScoutMutationAcknowledgement(async () => {
    sends++;
    return 'accepted';
  }, () => current, 100);
  current = false;
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(sends, 0);
});

test('session switch during one successful response cannot publish its acknowledgement', async () => {
  let current = true;
  let resolveWrite;
  let sends = 0;
  const pending = boundedScoutMutationAcknowledgement(() => {
    sends++;
    return new Promise((resolve) => { resolveWrite = resolve; });
  }, () => current, 100);
  await delay(0);
  current = false;
  resolveWrite('accepted');
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(sends, 1);
});

test('hung response times out as UNKNOWN, with no automatic retry or invented success', async () => {
  let sends = 0;
  await assert.rejects(() => boundedScoutMutationAcknowledgement(() => {
    sends++;
    return new Promise(() => {});
  }, () => true, 12), /タイムアウト/);
  assert.equal(sends, 1);
});

test('late successful acknowledgement after UI deadline never changes earlier outcome', async () => {
  let complete;
  let sends = 0;
  const pending = boundedScoutMutationAcknowledgement(() => {
    sends++;
    return new Promise((resolve) => { complete = resolve; });
  }, () => true, 12);
  await assert.rejects(pending, /タイムアウト/);
  complete('accepted');
  await delay(0);
  assert.equal(sends, 1);
});

test('late rejected RPC after UI deadline is observed without an unhandled rejection', async () => {
  let rejectWrite;
  const unhandled = [];
  const track = (error) => { unhandled.push(error); };
  process.on('unhandledRejection', track);
  try {
    const pending = boundedScoutMutationAcknowledgement(() => new Promise((_resolve, reject) => {
      rejectWrite = reject;
    }), () => true, 12);
    await assert.rejects(pending, /タイムアウト/);
    rejectWrite(new Error('private candidate document path'));
    await delay(20);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', track);
  }
});

test('actual RPC rejection propagates to caller for existing unknown-outcome quarantine', async () => {
  let sends = 0;
  await assert.rejects(() => boundedScoutMutationAcknowledgement(async () => {
    sends++;
    throw new Error('private RPC exception');
  }, () => true, 100), /private RPC exception/);
  assert.equal(sends, 1);
});
