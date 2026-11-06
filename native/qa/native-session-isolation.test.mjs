// Behavioural suite: cross-account isolation and sign-out purge, against the real
// candidateLocalStateSession.ts and candidateLocalPrivacyPurge.ts. Replaces the missing
// signout-local-purge / session-handoff-local-purge / candidate-write-session-quarantine /
// durable-mutation-purge-race / document-picker-purge-race contracts at the session-fence level.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const stub = pathToFileURL(fileURLToPath(new URL('./fixtures/purge-surfaces.stub.mjs', import.meta.url))).href;
const mapped = new Set(['./durableMutation', './documentPickerCache', './resumePhotoDeviceCache', './offlineSavedJobs', './offlineSavedSnapshot']);
registerHooks({ resolve(specifier, context, nextResolve) {
  if (mapped.has(specifier)) return nextResolve(stub, context);
  if (/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const sess = await import('../src/lib/candidateLocalStateSession.ts');
const purge = await import('../src/lib/candidateLocalPrivacyPurge.ts');
const surfaces = await import('./fixtures/purge-surfaces.stub.mjs');

beforeEach(() => { surfaces.log.length = 0; surfaces.fail.clear(); surfaces.delayMs.value = 0;
  for (const [u, s] of [['A', 's1'], ['A', 's2'], ['B', 's1']]) sess.unblockCandidateLocalStateSession(u, s); });

test('identifiers are required and trimmed', () => {
  assert.throws(() => sess.captureCandidateLocalStateSessionLease('', 's'), /AUTH_REQUIRED/);
  assert.throws(() => sess.captureCandidateLocalStateSessionLease('A', '  '), /SESSION_REQUIRED/);
  assert.deepEqual(sess.captureCandidateLocalStateSessionLease(' A ', ' s1 ').userId, 'A');
});
test('a write under a current lease runs and returns', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  assert.equal(await sess.withCandidateLocalStateWrite(lease, async () => 7), 7);
});
test('blocking a session invalidates its outstanding lease before the write runs', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  sess.blockCandidateLocalStateSession('A', 's1');
  let ran = false;
  await assert.rejects(sess.withCandidateLocalStateWrite(lease, async () => { ran = true; }), /SESSION_CHANGED/);
  assert.equal(ran, false);
  assert.throws(() => sess.captureCandidateLocalStateSessionLease('A', 's1'), /SESSION_BLOCKED/);
});
test('session handoff mid-write discards the result (write that already crossed is reported as changed)', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  await assert.rejects(sess.withCandidateLocalStateWrite(lease, async () => { sess.blockCandidateLocalStateSession('A', 's1'); return 1; }), /SESSION_CHANGED/);
});
test('re-opening the same session id yields a new generation; the old lease stays dead', async () => {
  const old = sess.captureCandidateLocalStateSessionLease('A', 's2');
  sess.blockCandidateLocalStateSession('A', 's2');
  sess.unblockCandidateLocalStateSession('A', 's2');
  const fresh = sess.captureCandidateLocalStateSessionLease('A', 's2');
  assert.ok(fresh.generation > old.generation);
  await assert.rejects(sess.withCandidateLocalStateWrite(old, async () => 1), /SESSION_CHANGED/);
  assert.equal(await sess.withCandidateLocalStateWrite(fresh, async () => 2), 2);
});
test('blocking account A never affects account B', async () => {
  const b = sess.captureCandidateLocalStateSessionLease('B', 's1');
  sess.blockCandidateLocalStateSession('A', 's1');
  assert.equal(await sess.withCandidateLocalStateWrite(b, async () => 'ok'), 'ok');
});
test('writes for one owner are serialized in order', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  const order = [];
  const w = (n, ms) => sess.withCandidateLocalStateWrite(lease, async () => { order.push(`${n}:start`); await new Promise((r) => setTimeout(r, ms)); order.push(`${n}:end`); });
  await Promise.all([w(1, 20), w(2, 1)]);
  assert.deepEqual(order, ['1:start', '1:end', '2:start', '2:end']);
});
test('a purge blocks new writes immediately and drains writes already in the queue', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  const events = [];
  const inFlight = sess.withCandidateLocalStateWrite(lease, async () => { await new Promise((r) => setTimeout(r, 20)); events.push('write-done'); });
  await new Promise((r) => setTimeout(r, 5)); // the write is now inside native storage
  const purging = sess.withCandidateLocalStatePurge('A', async () => { events.push('purge-ran'); });
  assert.throws(() => sess.captureCandidateLocalStateSessionLease('A', 's1'), /SESSION_BLOCKED/, 'new leases blocked synchronously');
  await assert.rejects(inFlight, /SESSION_CHANGED/);
  await purging;
  assert.deepEqual(events, ['write-done', 'purge-ran'], 'physical purge runs after the in-flight write finished');
  assert.doesNotThrow(() => sess.captureCandidateLocalStateSessionLease('A', 's1'), 'writes resume after the purge boundary');
});
test('a queued write that has not started when the purge begins is cancelled and never runs', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  let ran = false;
  const queued = sess.withCandidateLocalStateWrite(lease, async () => { ran = true; });
  const purging = sess.withCandidateLocalStatePurge('A', async () => {});
  await assert.rejects(queued, /SESSION_CHANGED/);
  await purging;
  assert.equal(ran, false);
});
test('overlapping purges keep writes blocked until the last one finishes', async () => {
  const first = sess.withCandidateLocalStatePurge('A', async () => { await new Promise((r) => setTimeout(r, 15)); });
  const second = sess.withCandidateLocalStatePurge('A', async () => { await new Promise((r) => setTimeout(r, 5)); });
  await first;
  assert.throws(() => sess.captureCandidateLocalStateSessionLease('A', 's1'), /SESSION_BLOCKED/);
  await second;
  assert.doesNotThrow(() => sess.captureCandidateLocalStateSessionLease('A', 's1'));
});
test('a purge for A does not block B', async () => {
  const p = sess.withCandidateLocalStatePurge('A', async () => { await new Promise((r) => setTimeout(r, 10)); });
  assert.doesNotThrow(() => sess.captureCandidateLocalStateSessionLease('B', 's1'));
  await p;
});

test('sign-out purge clears all five private surfaces for the owner', async () => {
  const r = await purge.purgeCandidatePrivateLocalState(' A ');
  assert.deepEqual(r, { ownerId: 'A', clearedSurfaces: 5 });
  const done = surfaces.log.filter(([, , phase]) => phase === 'done').map(([n]) => n).sort();
  assert.deepEqual(done, ['document-picker-cache', 'durable-mutation-recovery', 'resume-photo-cache', 'saved-command-queue', 'saved-display-snapshot']);
  for (const [n, arg] of surfaces.log) if (n !== 'document-picker-cache') assert.equal(arg, 'A');
});
test('purge fails closed: one failed surface is reported, and the others are still attempted', async () => {
  surfaces.fail.add('resume-photo-cache');
  await assert.rejects(purge.purgeCandidatePrivateLocalState('A'), (e) => purge.isCandidateLocalPrivacyPurgeError(e) && /resume-photo-cache/.test(e.message) && e.failures.length === 1);
  const done = surfaces.log.filter(([, , phase]) => phase === 'done').length;
  assert.equal(done, 4);
});
test('purge failure still releases the write block so the next sign-in works', async () => {
  surfaces.fail.add('saved-command-queue');
  await assert.rejects(purge.purgeCandidatePrivateLocalState('A'));
  assert.doesNotThrow(() => sess.captureCandidateLocalStateSessionLease('A', 's1'));
});
test('purge requires an owner id', async () => {
  await assert.rejects(purge.purgeCandidatePrivateLocalState('  '), /AUTH_REQUIRED/);
  assert.equal(surfaces.log.length, 0);
});
test('a stale write started before sign-out cannot recreate state after the purge completed', async () => {
  const lease = sess.captureCandidateLocalStateSessionLease('A', 's1');
  await purge.purgeCandidatePrivateLocalState('A');
  sess.blockCandidateLocalStateSession('A', 's1');
  let recreated = false;
  await assert.rejects(sess.withCandidateLocalStateWrite(lease, async () => { recreated = true; }), /SESSION_CHANGED/);
  assert.equal(recreated, false);
});
test('isCandidateLocalPrivacyPurgeError does not match unrelated errors', () => {
  assert.equal(purge.isCandidateLocalPrivacyPurgeError(new Error('network')), false);
  assert.equal(purge.isCandidateLocalPrivacyPurgeError(null), false);
});
