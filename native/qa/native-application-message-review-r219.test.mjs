import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readApplicationMessageReview } from '../src/lib/applicationMessageReviewRead.ts';

function deferred() {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const owner = { ownerId: 'candidate-A', ownerSessionId: 'session-A', applicationId: 'app-A' };
const client = Object.freeze({ tenant: 'candidate-A' });
function options(override = {}) {
  return {
    pin: async () => ({ ...owner, client, isCurrent: () => true }),
    read: async () => [{ id: 'confirmed-message', sender_role: 'jobseeker', body: 'synthetic only' }],
    applicationId: owner.applicationId,
    pendingOwner: owner,
    isCurrent: () => true,
    timeoutMs: 25,
    ...override,
  };
}

test('canonical read returns only the same-session thread; no send or mutation invoked', async () => {
  let reads = 0;
  const rows = await readApplicationMessageReview(options({ read: async (pinnedClient, id) => {
    assert.equal(pinnedClient, client);
    assert.equal(id, owner.applicationId);
    reads++;
    return [{ id: 'fresh', body: 'synthetic' }];
  } }));
  assert.deepEqual(rows, [{ id: 'fresh', body: 'synthetic' }]);
  assert.equal(reads, 1);
});

test('changed owner, session, or application rejects before any private thread read', async () => {
  for (const pendingOwner of [
    { ...owner, ownerId: 'candidate-B' },
    { ...owner, ownerSessionId: 'session-B' },
    { ...owner, applicationId: 'app-B' },
  ]) {
    let reads = 0;
    await assert.rejects(readApplicationMessageReview(options({ pendingOwner, read: async () => { reads++; return []; } })), /前のログイン状態/);
    assert.equal(reads, 0);
  }
});

test('screen revocation before token microtask starts no Clerk pin and no thread read', async () => {
  let current = true; let pins = 0; let reads = 0;
  const pending = readApplicationMessageReview(options({
    isCurrent: () => current,
    pin: async () => { pins++; return { ...owner, client, isCurrent: () => true }; },
    read: async () => { reads++; return []; },
  }));
  current = false;
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(pins, 0); assert.equal(reads, 0);
});

test('hung Clerk token ends review with timeout and never opens message thread', async () => {
  const token = deferred(); let reads = 0;
  const pending = readApplicationMessageReview(options({ pin: () => token.promise, read: async () => { reads++; return []; }, timeoutMs: 8 }));
  await assert.rejects(pending, /タイムアウト/);
  token.resolve({ ...owner, client, isCurrent: () => true });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(reads, 0);
});

test('hung canonical thread read times out without inventing zero messages or retries', async () => {
  const thread = deferred(); let reads = 0;
  const pending = readApplicationMessageReview(options({ read: () => { reads++; return thread.promise; }, timeoutMs: 8 }));
  await assert.rejects(pending, /タイムアウト/);
  thread.resolve([{ id: 'late' }]);
  await Promise.resolve();
  assert.equal(reads, 1);
});

test('session revocation during slow canonical response never publishes late messages', async () => {
  const thread = deferred(); let current = true;
  const pending = readApplicationMessageReview(options({ read: () => thread.promise, isCurrent: () => current }));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  current = false;
  thread.resolve([{ id: 'private' }]);
  await assert.rejects(pending, /ログイン状態/);
});

test('read failure propagates rather than clearing an unconfirmed sent draft', async () => {
  await assert.rejects(readApplicationMessageReview(options({ read: async () => { throw new Error('synthetic network failure'); } })), /network failure/);
});

test('late rejected transport after timeout is observed without unhandled rejection', async () => {
  const thread = deferred();
  const pending = readApplicationMessageReview(options({ read: () => thread.promise, timeoutMs: 8 }));
  await assert.rejects(pending, /タイムアウト/);
  thread.reject(new Error('late synthetic transport failure'));
  await Promise.resolve(); await Promise.resolve();
});

test('review without uncertain send may still refresh authorized messages', async () => {
  const rows = await readApplicationMessageReview(options({ pendingOwner: null }));
  assert.equal(rows.length, 1);
});

test('real ApplicationDetail screen wires bounded review read without any send retry', () => {
  const content = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
  assert.match(content, /readApplicationMessageReview\(\{/);
  assert.match(content, /pendingOwner: review \?/);
  assert.match(content, /read: listApplicationMessages/);
});
