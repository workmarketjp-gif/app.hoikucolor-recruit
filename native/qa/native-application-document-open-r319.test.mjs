import test from 'node:test';
import assert from 'node:assert/strict';
import { openCandidateApplicationDocument } from '../src/lib/openCandidateApplicationDocument.ts';

const docUrl = 'https://storage.example.test/object/sign/application-document?token=synthetic';
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((rs, rj) => { resolve = rs; reject = rj; });
  return { promise, resolve, reject };
};
const sleep = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
function scenario({ token, url, current = () => true, pinnedCurrent = () => true, timeoutMs = 35 } = {}) {
  const calls = [];
  const run = () => openCandidateApplicationDocument({
    pin: async () => { calls.push('pin'); return token ? token() : { client: 'synthetic-clerk-bound-client', isCurrent: pinnedCurrent }; },
    getSignedUrl: async (client) => { calls.push(['signed-url', client]); return url ? url() : docUrl; },
    openUrl: async (received) => { calls.push(['open', received]); },
    isCurrent: current,
    timeoutMs,
  });
  return { run, calls };
}
test('successful authorized open pins, signs once, then invokes the OS handler once', async () => {
  const task = scenario(); await task.run();
  assert.deepEqual(task.calls, ['pin', ['signed-url', 'synthetic-clerk-bound-client'], ['open', docUrl]]);
});
test('never requests Clerk token after a lost screen lease', async () => {
  const task = scenario({ current: () => false });
  await assert.rejects(task.run(), /ログイン状態/);
  assert.deepEqual(task.calls, []);
});
test('stalled token acquisition times out and its late response cannot sign or open', async () => {
  const pending = deferred(); const task = scenario({ token: () => pending.promise, timeoutMs: 10 });
  await assert.rejects(task.run(), /タイムアウト/);
  pending.resolve({ client: 'late-client', isCurrent: () => true }); await sleep();
  assert.deepEqual(task.calls, ['pin']);
});
test('stalled signed URL acquisition times out and a late signed URL never opens', async () => {
  const pending = deferred(); const task = scenario({ url: () => pending.promise, timeoutMs: 10 });
  await assert.rejects(task.run(), /タイムアウト/);
  pending.resolve(docUrl); await sleep();
  assert.equal(task.calls.some((event) => Array.isArray(event) && event[0] === 'open'), false);
});
test('late signed-URL failures are observed without a late OS launch', async () => {
  const pending = deferred(); const task = scenario({ url: () => pending.promise, timeoutMs: 10 });
  await assert.rejects(task.run(), /タイムアウト/);
  pending.reject(new Error('synthetic RLS denial')); await sleep();
  assert.equal(task.calls.some((event) => Array.isArray(event) && event[0] === 'open'), false);
});
test('logout after token but before signed URL result rejects without opening', async () => {
  let allowed = true;
  const task = scenario({ url: async () => { allowed = false; return docUrl; }, current: () => allowed });
  await assert.rejects(task.run(), /閲覧状態/);
  assert.equal(task.calls.some((event) => Array.isArray(event) && event[0] === 'open'), false);
});
test('revocation of the pinned session before URL signing forbids OS launch', async () => {
  let allowed = true;
  const task = scenario({ url: async () => { allowed = false; return docUrl; }, pinnedCurrent: () => allowed });
  await assert.rejects(task.run(), /閲覧状態/);
  assert.equal(task.calls.some((event) => Array.isArray(event) && event[0] === 'open'), false);
});
test('non-HTTPS, credential-bearing and malformed links never reach the OS', async () => {
  for (const value of ['http://storage.example.test/private', 'javascript:alert(1)',
    'https://user:password@storage.example.test/file', 'not-a-url']) {
    const task = scenario({ url: async () => value });
    await assert.rejects(task.run(), /安全なURL/);
    assert.equal(task.calls.some((event) => Array.isArray(event) && event[0] === 'open'), false);
  }
});
test('signed URL provider failures propagate without claiming an opened document', async () => {
  const task = scenario({ url: async () => { throw new Error('synthetic private Storage denial'); } });
  await assert.rejects(task.run(), /Storage denial/);
  assert.equal(task.calls.some((event) => Array.isArray(event) && event[0] === 'open'), false);
});
test('session revoked during pending token cannot issue a signed URL', async () => {
  let allowed = true;
  const pending = deferred(); const task = scenario({ token: () => pending.promise, current: () => allowed });
  const running = task.run(); await sleep(2); allowed = false;
  pending.resolve({ client: 'old-client', isCurrent: () => true });
  await assert.rejects(running, /ログイン状態/);
  assert.deepEqual(task.calls, ['pin']);
});
