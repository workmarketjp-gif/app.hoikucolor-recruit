import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pinForApplicationMutation } from '../src/lib/applicationMutationPin.ts';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const validPin = () => ({ ownerId: 'synthetic-a', ownerSessionId: 'synthetic-s',
  client: { source: 'synthetic-scoped' }, isCurrent: () => true });

test('valid pinned session allows exactly one later caller-controlled write', async () => {
  let pins = 0; let writes = 0;
  const pinned = await pinForApplicationMutation(async () => { pins++; return validPin(); }, () => true, 20);
  assert.equal(pinned.client.source, 'synthetic-scoped');
  assert.equal(pins, 1);
  if (pinned.isCurrent()) writes++;
  assert.equal(writes, 1);
});

test('revocation before token microtask prevents token acquisition and every write', async () => {
  let current = true; let pins = 0; let writes = 0;
  const attempt = (async () => {
    const pinned = await pinForApplicationMutation(async () => { pins++; return validPin(); }, () => current, 20);
    if (pinned.isCurrent()) writes++;
  })();
  current = false;
  await assert.rejects(attempt, /ログイン状態/);
  assert.equal(pins, 0); assert.equal(writes, 0);
});

test('logout, App Lock or route blur during token wait prevents downstream write', async () => {
  const pending = deferred(); let current = true; let writes = 0;
  const attempt = (async () => {
    const pinned = await pinForApplicationMutation(() => pending.promise, () => current, 20);
    if (pinned.isCurrent()) writes++;
  })();
  await Promise.resolve(); await Promise.resolve();
  current = false; pending.resolve(validPin());
  await assert.rejects(attempt, /ログイン状態/);
  assert.equal(writes, 0);
});

test('null and revoked pinned sessions reject before caller can invoke a mutation', async () => {
  for (const session of [null, { ...validPin(), isCurrent: () => false }]) {
    await assert.rejects(pinForApplicationMutation(async () => session, () => true, 20), /ログイン状態/);
  }
});

test('hung token times out without attempting or retrying an irreversible RPC', async () => {
  const pending = deferred(); let pins = 0; let writes = 0;
  const attempt = (async () => {
    const pinned = await pinForApplicationMutation(() => { pins++; return pending.promise; }, () => true, 8);
    if (pinned.isCurrent()) writes++;
  })();
  await assert.rejects(attempt, /タイムアウト/);
  pending.resolve(validPin());
  await Promise.resolve(); await Promise.resolve();
  assert.equal(pins, 1);
  assert.equal(writes, 0);
});

test('late token rejection after deadline is consumed (no unhandled rejection)', async () => {
  const pending = deferred();
  const attempt = pinForApplicationMutation(() => pending.promise, () => true, 8);
  await assert.rejects(attempt, /タイムアウト/);
  pending.reject(new Error('synthetic late auth rejection'));
  await Promise.resolve(); await Promise.resolve();
});

test('token pin failure propagates; no silent success or auto-retry', async () => {
  let calls = 0;
  await assert.rejects(pinForApplicationMutation(async () => {
    calls++; throw new Error('synthetic Clerk unavailable');
  }, () => true, 20), /synthetic Clerk unavailable/);
  assert.equal(calls, 1);
});

test('real ApplicationDetail TSX wires pre-write pin to all six mutation entry points', () => {
  const screen = readFileSync(new URL('../src/app/application/[id].tsx', import.meta.url), 'utf8');
  assert.match(screen, /import \{ pinForApplicationMutation \} from '\.\.\/\.\.\/lib\/applicationMutationPin'/);
  const matches = screen.match(/await pinForApplicationMutation\(pinCandidateAction,/g) ?? [];
  assert.equal(matches.length, 6);
  assert.equal((screen.match(/await pinCandidateAction\(\)/g) ?? []).length, 0); // r219 moved read-only review to bounded helper
  assert.match(screen, /readApplicationMessageReview\(\{/);
  assert.match(screen, /read: listApplicationMessages,/);
  assert.match(screen, /pinForApplicationMutation\(pinCandidateAction, \(\) => messageRequestGeneration === generation\.current\)/);
  assert.match(screen, /pinForApplicationMutation\(pinCandidateAction, \(\) => readGeneration === generation\.current\)/);
  for (const verb of ['respondToInterviewDurable', 'sendApplicationMessageDurable',
    'acceptOffer', 'withdrawApplication', 'repairApplicationDocumentHandoff',
    'markVisibleApplicationMessagesRead']) assert.match(screen, new RegExp('await '+verb+'\\('));
  assert.doesNotMatch(screen, /boundedPrivateRead\([^)]*?(?:sendApplicationMessageDurable|acceptOffer|withdrawApplication)/s);
});
