import assert from 'node:assert/strict';
import test from 'node:test';
import { pinForScoutMutation } from '../src/lib/scoutMutationPin.ts';

const currentPin = () => ({ ownerId: 'synthetic-candidate', isCurrent: () => true });

test('pre-mutation pin returns the exact pinned session, never constructs a new one', async () => {
  const pin = currentPin();
  assert.strictEqual(await pinForScoutMutation(async () => pin, () => true, 100), pin);
});

test('already revoked view does not request a token or launch any write', async () => {
  let pinCalls = 0;
  let writes = 0;
  await assert.rejects(async () => {
    const pinned = await pinForScoutMutation(async () => {pinCalls++;return currentPin();}, () => false);
    writes += 1;
    return pinned;
  }, /ログイン状態/);
  assert.equal(pinCalls, 0);
  assert.equal(writes, 0);
});

test('view revoked before queued pin microtask does not request token', async () => {
  let allowed = true;
  let pinCalls = 0;
  const promise = pinForScoutMutation(async () => {pinCalls++;return currentPin();}, () => allowed);
  allowed = false;
  await assert.rejects(promise, /ログイン状態/);
  assert.equal(pinCalls, 0);
});

test('revocation while token pin is pending stops downstream mutation', async () => {
  let release;
  let allowed = true;
  let writes = 0;
  const pending = new Promise(resolve => {release = resolve;});
  const run = async () => {
    const pinned = await pinForScoutMutation(() => pending, () => allowed, 100);
    writes++;
    return pinned;
  };
  const promise = run();
  await new Promise(resolve => setImmediate(resolve));
  allowed = false;
  release(currentPin());
  await assert.rejects(promise, /ログイン状態/);
  assert.equal(writes, 0);
});

test('timeout is confined to the pin, and late resolution cannot send a scout response', async () => {
  let release;
  let calls = 0;
  let mutations = 0;
  const pending = new Promise(resolve => {release = resolve;});
  const run = async () => {
    const pinned = await pinForScoutMutation(() => {calls++;return pending;}, () => true, 12);
    mutations++;
    return pinned;
  };
  await assert.rejects(run(), /タイムアウト/);
  release(currentPin());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(mutations, 0);
});

test('after a failed pin, an explicit user retry may succeed without automatic duplicate', async () => {
  let calls = 0;
  const pin = currentPin();
  const load = () => {
    calls++;
    return calls === 1 ? new Promise(() => {}) : Promise.resolve(pin);
  };
  await assert.rejects(pinForScoutMutation(load, () => true, 12), /タイムアウト/);
  assert.equal(calls, 1);
  assert.strictEqual(await pinForScoutMutation(load, () => true, 100), pin);
  assert.equal(calls, 2);
});

test('null/expired pinned candidate never reaches action', async () => {
  for (const value of [null, {isCurrent:()=>false}]) {
    let writes = 0;
    await assert.rejects(async () => {
      await pinForScoutMutation(async () => value, () => true, 100);
      writes++;
    }, /ログイン状態/);
    assert.equal(writes, 0);
  }
});

test('pin rejection propagates without changing the error into a fabricated success', async () => {
  await assert.rejects(pinForScoutMutation(() => Promise.reject(Error('synthetic getToken error')), () => true, 100), /synthetic getToken error/);
});

test('a successful pin does not impose a deadline on the subsequent scout mutation', async () => {
  let finishWrite;
  let resolved = false;
  const pendingWrite = new Promise(resolve => {finishWrite = resolve;});
  const run = async () => {
    await pinForScoutMutation(async () => currentPin(), () => true, 10);
    const result = await pendingWrite;
    resolved = true;
    return result;
  };
  const operation = run();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(resolved, false);
  finishWrite('synthetic-authorized-result');
  assert.equal(await operation, 'synthetic-authorized-result');
});
