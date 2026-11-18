import test from 'node:test';
import assert from 'node:assert/strict';
import { openCandidateApplicationDocument } from '../src/lib/openCandidateApplicationDocument.ts';

// Reuse the app's real bounded private-document opener for the saved vault.
// Synthetic URLs and sessions only; never touch candidate data or actual Storage.
const url = 'https://storage.example.invalid/object/sign/jobseekers/candidate-a/document.pdf?token=synthetic';
function deferred() {
  let resolve, reject;
  const promise = new Promise((rs, rj) => { resolve = rs; reject = rj; });
  return { promise, resolve, reject };
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 20));
function makeScenario({ pin, sign, isCurrent, pinnedCurrent, timeoutMs = 15 } = {}) {
  const calls = [];
  const active = isCurrent ?? (() => true);
  const run = () => openCandidateApplicationDocument({
    pin: async () => {
      calls.push('pin');
      return pin ? pin() : { client: 'private-candidate-client', isCurrent: pinnedCurrent ?? (() => true) };
    },
    getSignedUrl: async (client) => {
      calls.push(['sign', client]);
      return sign ? sign() : url;
    },
    openUrl: async (target) => { calls.push(['open', target]); },
    isCurrent: active,
    timeoutMs,
  });
  return { run, calls };
}

test('saved private source opens once after a pinned token and signed URL', async () => {
  const x = makeScenario(); await x.run();
  assert.deepEqual(x.calls, ['pin', ['sign', 'private-candidate-client'], ['open', url]]);
});

test('lost owner or private shield before pin refuses token acquisition', async () => {
  const x = makeScenario({ isCurrent: () => false });
  await assert.rejects(x.run(), /ログイン状態/);
  assert.deepEqual(x.calls, []);
});

test('stalled Clerk pin times out and late pin cannot acquire signed capability', async () => {
  const pending = deferred(); const x = makeScenario({ pin: () => pending.promise, timeoutMs: 7 });
  await assert.rejects(x.run(), /タイムアウト/);
  pending.resolve({ client: 'stale-owner', isCurrent: () => true }); await pause();
  assert.deepEqual(x.calls, ['pin']);
});

test('stalled Storage signing times out; late private URL cannot be dispatched', async () => {
  const pending = deferred(); const x = makeScenario({ sign: () => pending.promise, timeoutMs: 7 });
  await assert.rejects(x.run(), /タイムアウト/);
  pending.resolve(url); await pause();
  assert.equal(x.calls.some((entry) => Array.isArray(entry) && entry[0] === 'open'), false);
});

test('late Storage error is observed after timeout without OS viewer or unhandled failure', async () => {
  const pending = deferred(); const x = makeScenario({ sign: () => pending.promise, timeoutMs: 7 });
  await assert.rejects(x.run(), /タイムアウト/);
  pending.reject(new Error('private token/owner/path must not be displayed')); await pause();
  assert.equal(x.calls.some((entry) => Array.isArray(entry) && entry[0] === 'open'), false);
});

test('account switch during signing revokes saved-file OS open', async () => {
  let allowed = true;
  const x = makeScenario({ isCurrent: () => allowed, sign: async () => { allowed = false; return url; } });
  await assert.rejects(x.run(), /閲覧状態/);
  assert.equal(x.calls.some((entry) => Array.isArray(entry) && entry[0] === 'open'), false);
});

test('pinned session expiry during Storage signing prevents saved-file OS open', async () => {
  let current = true;
  const x = makeScenario({ pinnedCurrent: () => current, sign: async () => { current = false; return url; } });
  await assert.rejects(x.run(), /閲覧状態/);
  assert.equal(x.calls.some((entry) => Array.isArray(entry) && entry[0] === 'open'), false);
});

test('unsafe/private URL shapes are rejected without launching an OS handler', async () => {
  for (const bad of ['http://storage.example.invalid/object', 'file:///private/path', 'https://user:secret@storage.example.invalid/x', 'not-url']) {
    const x = makeScenario({ sign: async () => bad });
    await assert.rejects(x.run(), /安全なURL/);
    assert.equal(x.calls.some((entry) => Array.isArray(entry) && entry[0] === 'open'), false);
  }
});
