import assert from 'node:assert/strict';
import test from 'node:test';
import { pinForApplicationMutation } from '../src/lib/applicationMutationPin.ts';

const pin = (ownerId = 'synthetic-user-A', ownerSessionId = 'synthetic-session-A', live = () => true) =>
  ({ ownerId, ownerSessionId, isCurrent: live, client: { source: 'synthetic-only' } });
const identity = (p) => p.ownerId === 'synthetic-user-A' && p.ownerSessionId === 'synthetic-session-A';

// ResumeScreen also checks candidateViewOwnerKey and its saved generation before RPC.
const gatedResumeSave = async (pinAction, current, save, timeoutMs = 30) => {
  const pinned = await pinForApplicationMutation(pinAction, current, timeoutMs);
  if (!identity(pinned) || !pinned.isCurrent() || !current()) throw Error('安全なログイン状態を確認できませんでした。');
  return save(pinned.client);
};

test('resume save uses one pinned Clerk session, never a replacement client', async () => {
  const same = pin(); let seen;
  const result = await gatedResumeSave(async () => same, () => true, async (client) => { seen = client; return 'confirmed'; });
  assert.equal(result, 'confirmed');
  assert.equal(seen, same.client);
});

test('already locked screen cannot start token acquisition or resume RPC', async () => {
  let calls = 0; let writes = 0;
  await assert.rejects(gatedResumeSave(async () => { calls++; return pin(); }, () => false, async () => { writes++; }), /ログイン状態/);
  assert.equal(calls, 0); assert.equal(writes, 0);
});

test('App Lock before deferred token-launch prevents token request', async () => {
  let current = true; let calls = 0; let writes = 0;
  const pending = gatedResumeSave(async () => { calls++; return pin(); }, () => current, async () => { writes++; });
  current = false;
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(calls, 0); assert.equal(writes, 0);
});

test('hung Clerk token deadline stops resume RPC, even if token resolves late', async () => {
  let release; let writes = 0;
  const token = new Promise(resolve => { release = resolve; });
  await assert.rejects(gatedResumeSave(() => token, () => true, async () => { writes++; }, 14), /タイムアウト/);
  release(pin());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 0);
});

test('session switched during getToken never writes under either candidate', async () => {
  let release; let current = true; let writes = 0;
  const pending = gatedResumeSave(() => new Promise(resolve => { release = resolve; }), () => current, async () => { writes++; });
  await new Promise(resolve => setImmediate(resolve));
  current = false;
  release(pin());
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(writes, 0);
});

test('mismatched candidate owner or session is rejected before save', async () => {
  let writes = 0;
  for (const wrong of [pin('synthetic-user-B'), pin('synthetic-user-A','synthetic-session-B')]) {
    await assert.rejects(gatedResumeSave(async () => wrong, () => true, async () => { writes++; }), /ログイン状態/);
  }
  assert.equal(writes, 0);
});

test('the pre-write timeout does not time out or resend an in-flight canonical save', async () => {
  let complete; let writes = 0; let ended = false;
  const rpc = new Promise(resolve => { complete = resolve; });
  const operation = gatedResumeSave(async () => pin(), () => true, () => { writes++; return rpc; }, 10)
    .then(v => { ended = true; return v; });
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(writes, 1); assert.equal(ended, false);
  complete('one verified result');
  assert.equal(await operation, 'one verified result');
  assert.equal(writes, 1);
});

test('failed token request cannot be treated as a completed save', async () => {
  let writes = 0;
  await assert.rejects(gatedResumeSave(async () => { throw Error('synthetic auth rejection'); }, () => true, async () => { writes++; }), /synthetic auth rejection/);
  assert.equal(writes, 0);
});
