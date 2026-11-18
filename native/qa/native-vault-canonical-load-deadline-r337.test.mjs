import test from 'node:test';
import assert from 'node:assert/strict';
import { readCandidateVaultSnapshot } from '../src/lib/readCandidateVaultSnapshot.ts';

const key = (ownerId, sessionId) => JSON.stringify([ownerId, sessionId]);
const good = { id: 'document-1', jobseeker_clerk_user_id: 'candidate-a', file_path: 'candidate-a/test.pdf' };
const defer = () => { let resolve, reject; const promise = new Promise((rs, rj) => { resolve = rs; reject = rj; }); return { resolve, reject, promise }; };
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

function scenario({ pin, read, current, pinnedCurrent, ownerKey = key('candidate-a', 'session-1'), timeoutMs = 20, assertDocumentOwner } = {}) {
  const calls = [];
  const active = current ?? (() => true);
  const run = () => readCandidateVaultSnapshot({
    pin: async () => {
      calls.push('pin');
      return pin ? pin() : { client: 'candidate-a-client', ownerId: 'candidate-a', ownerSessionId: 'session-1', isCurrent: pinnedCurrent ?? (() => true) };
    },
    read: async (client) => { calls.push(['read', client]); return read ? read() : [good]; },
    ownerKey,
    ownerKeyFor: key,
    isCurrent: active,
    assertDocumentOwner: assertDocumentOwner ?? ((rows, ownerId) => {
      if (!Array.isArray(rows) || rows.some((r) => r.jobseeker_clerk_user_id !== ownerId || !r.file_path)) throw new Error('private row rejected');
    }),
    timeoutMs,
  });
  return { run, calls };
}

test('loads exact-session, owner-verified documents once', async () => {
  const x = scenario(); assert.deepEqual(await x.run(), [good]);
  assert.deepEqual(x.calls, ['pin', ['read', 'candidate-a-client']]);
});

test('accepts a genuine canonical empty list, not a fabricated empty on failure', async () => {
  const x = scenario({ read: async () => [] }); assert.deepEqual(await x.run(), []);
});

test('lost screen or private shield blocks Clerk pin before async launch', async () => {
  const x = scenario({ current: () => false });
  await assert.rejects(x.run(), /ログイン状態/); assert.deepEqual(x.calls, []);
});

test('pending Clerk token times out and late response cannot start vault read', async () => {
  const d = defer(), x = scenario({ pin: () => d.promise, timeoutMs: 7 });
  await assert.rejects(x.run(), /タイムアウト/);
  d.resolve({ client: 'stale-client', ownerId: 'candidate-a', ownerSessionId: 'session-1', isCurrent: () => true });
  await pause(); assert.deepEqual(x.calls, ['pin']);
});

test('pending canonical list times out; late rows never become a successful snapshot', async () => {
  const d = defer(), x = scenario({ read: () => d.promise, timeoutMs: 7 });
  await assert.rejects(x.run(), /タイムアウト/);
  d.resolve([good]); await pause(); assert.deepEqual(x.calls, ['pin', ['read', 'candidate-a-client']]);
});

test('late rejected read is observed without an unhandled rejection', async () => {
  const d = defer(), x = scenario({ read: () => d.promise, timeoutMs: 7 });
  await assert.rejects(x.run(), /タイムアウト/);
  d.reject(new Error('private storage path and token')); await pause();
});

test('owner/session mismatch stops before querying candidate documents', async () => {
  const x = scenario({ pin: () => ({ client: 'wrong-client', ownerId: 'candidate-b', ownerSessionId: 'session-b', isCurrent: () => true }) });
  await assert.rejects(x.run(), /閲覧状態/); assert.deepEqual(x.calls, ['pin']);
});

test('owner becomes stale while fetching rows: no canonical result emitted', async () => {
  let current = true;
  const x = scenario({ current: () => current, read: async () => { current = false; return [good]; } });
  await assert.rejects(x.run(), /閲覧状態/);
});

test('pinned session revocation while fetching rows invalidates result', async () => {
  let pinned = true;
  const x = scenario({ pinnedCurrent: () => pinned, read: async () => { pinned = false; return [good]; } });
  await assert.rejects(x.run(), /閲覧状態/);
});

test('cross-owner list is rejected by canonical row checker', async () => {
  const x = scenario({ read: async () => [{ ...good, jobseeker_clerk_user_id: 'candidate-b' }] });
  await assert.rejects(x.run(), /private row rejected/);
});

test('malformed null response is not accepted as an empty collection', async () => {
  const x = scenario({ read: async () => null }); await assert.rejects(x.run(), /private row rejected/);
});

test('row owner changes during ownership verification: never publish result', async () => {
  let current = true;
  const x = scenario({ current: () => current, assertDocumentOwner: () => { current = false; } });
  await assert.rejects(x.run(), /閲覧状態/);
});

test('network error propagates without being converted to empty documents', async () => {
  const x = scenario({ read: async () => { throw new Error('API unavailable'); } });
  await assert.rejects(x.run(), /API unavailable/);
});
