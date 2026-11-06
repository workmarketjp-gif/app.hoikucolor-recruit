// Behavioural suite: foreground session freshness, Clerk identity atomicity and account-deletion policy.
// Runs the real sessionLifecycle.ts hooks and accountDeletionPolicy.ts in a minimal React hook runtime.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const compile = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function hookRuntime() {
  let cursor = 0; const slots = [], effects = [], pending = [];
  const react = {
    useState(init) { const i = cursor++; if (!(i in slots)) slots[i] = init; return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(init) { const i = cursor++; if (!(i in slots)) slots[i] = { current: init }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; const prev = slots[i]; if (prev && deps.every((d, j) => d === prev.deps[j])) return prev.fn; slots[i] = { fn, deps }; return fn; },
    useEffect(fn, deps) { const i = cursor++; const e = effects[i]; if (!e || !deps || deps.some((d, j) => d !== e.deps[j])) pending.push(() => { e?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  return { react, begin() { cursor = 0; }, flush() { while (pending.length) pending.shift()(); },
    unmount() { effects.forEach((e) => e?.cleanup?.()); } };
}

function load(clerkState) {
  const rt = hookRuntime();
  let appStateHandler = null; const removed = [];
  const mocks = {
    react: rt.react,
    '@clerk/expo': { useSession: () => clerkState.current },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_e, h) => { appStateHandler = h; return { remove: () => removed.push(1) }; } } },
  };
  const exports = {};
  vm.runInNewContext(compile(read('src/lib/sessionLifecycle.ts')), { exports, require: (n) => mocks[n], Error, Set, String, Boolean });
  return { exports, rt, fire: (state) => appStateHandler(state), removed };
}
const sessionOf = (userId, sessionId, getToken, status = 'active') => ({ id: sessionId, status, user: { id: userId }, getToken });
const state = (session, extra = {}) => ({ isLoaded: true, isSignedIn: Boolean(session), session, ...extra });
const render = (h) => { h.rt.begin(); const r = h.exports.useForegroundSessionRefresh(); h.rt.flush(); return r; };
const tick = () => new Promise((r) => setImmediate(r));

test('active session: refresh requests a non-cached token and clears the blocked flag', async () => {
  let args; const clerk = { current: state(sessionOf('u1', 's1', async (o) => { args = o; return 'tok'; })) };
  const h = load(clerk); const r = render(h);
  assert.equal(await r.refreshNow(), true);
  assert.equal(JSON.stringify(args), '{"skipCache":true}');
  assert.equal(render(h).blocked, false);
});
test('a missing token fails closed with SESSION_NOT_ACTIVE', async () => {
  const clerk = { current: state(sessionOf('u1', 's1', async () => null)) };
  const h = load(clerk); const r = render(h);
  assert.equal(await r.refreshNow(), false);
  const after = render(h);
  assert.equal(after.blocked, true); assert.equal(after.lastRefreshError, 'SESSION_NOT_ACTIVE');
});
test('a non-network refresh error (revoked/expired) fails closed', async () => {
  const clerk = { current: state(sessionOf('u1', 's1', async () => { throw new Error('session_revoked'); })) };
  const h = load(clerk); const r = render(h);
  await r.refreshNow();
  const after = render(h);
  assert.equal(after.blocked, true); assert.match(after.lastRefreshError, /revoked/);
});
test('an offline error does NOT sign the candidate out or block, and is reported as OFFLINE', async () => {
  for (const err of [Object.assign(new Error('x'), { name: 'ClerkOfflineError' }), new Error('Network request failed'), new Error('fetch timeout')]) {
    const clerk = { current: state(sessionOf('u1', 's1', async () => { throw err; })) };
    const h = load(clerk); const r = render(h);
    assert.equal(await r.refreshNow(), false);
    const after = render(h);
    assert.equal(after.blocked, false); assert.equal(after.lastRefreshError, 'OFFLINE');
  }
});
test('offline after an earlier hard failure keeps the block (cannot be bypassed by going offline)', async () => {
  let mode = 'revoked'; const clerk = { current: state(sessionOf('u1', 's1', async () => { throw mode === 'revoked' ? new Error('revoked') : new Error('offline'); })) };
  const h = load(clerk);
  await render(h).refreshNow(); mode = 'offline';
  await render(h).refreshNow();
  assert.equal(render(h).blocked, true);
});
test('identity swap while the token request is in flight discards the result (account switch atomicity)', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const sessionA = sessionOf('userA', 'sA', async () => { await gate; return null; });
  const clerk = { current: state(sessionA) };
  const h = load(clerk); const r = render(h);
  const pendingRefresh = r.refreshNow();
  clerk.current = state(sessionOf('userB', 'sB', async () => 'tok'));
  render(h);
  release();
  assert.equal(await pendingRefresh, false);
  assert.equal(render(h).blocked, false, 'A\'s null token must not block B');
});
test('a same-user session replacement mid-flight is also discarded', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const clerk = { current: state(sessionOf('u1', 's1', async () => { await gate; return 'tok'; })) };
  const h = load(clerk); const p = render(h).refreshNow();
  clerk.current = state(sessionOf('u1', 's2', async () => 'tok')); render(h);
  release();
  assert.equal(await p, false);
});
test('inactive, signed-out or non-active sessions never request a token', async () => {
  let calls = 0; const gt = async () => { calls++; return 't'; };
  for (const c of [state(null), state(sessionOf('u', 's', gt, 'expired')), { isLoaded: true, isSignedIn: false, session: sessionOf('u', 's', gt) }]) {
    assert.equal(await render(load({ current: c })).refreshNow(), false);
  }
  assert.equal(calls, 0);
});
test('returning from background refreshes; staying active or going to background does not', async () => {
  let calls = 0; const clerk = { current: state(sessionOf('u1', 's1', async () => { calls++; return 't'; })) };
  const h = load(clerk); render(h);
  h.fire('inactive'); await tick(); assert.equal(calls, 0);
  h.fire('active'); await tick(); assert.equal(calls, 1);
  h.fire('active'); await tick(); assert.equal(calls, 1, 'active->active is not a foreground transition');
  h.fire('background'); h.fire('active'); await tick(); assert.equal(calls, 2);
});
test('signing out clears a previous block so the next account starts clean', async () => {
  const clerk = { current: state(sessionOf('u1', 's1', async () => null)) };
  const h = load(clerk); await render(h).refreshNow();
  assert.equal(render(h).blocked, true);
  clerk.current = { isLoaded: true, isSignedIn: false, session: null };
  render(h); // effects run after the render that observed sign-out
  const after = render(h);
  assert.equal(after.blocked, false); assert.equal(after.lastRefreshError, null);
});
test('unmount removes the AppState listener and cancels in-flight results', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const clerk = { current: state(sessionOf('u1', 's1', async () => { await gate; return null; })) };
  const h = load(clerk); const p = render(h).refreshNow();
  h.rt.unmount(); release();
  assert.equal(await p, false);
  assert.equal(h.removed.length, 1);
});

// ---- useActiveClerkSession -------------------------------------------------
function active(clerkState) {
  const h = load({ current: clerkState }); h.rt.begin(); const r = h.exports.useActiveClerkSession(); return r;
}
test('active requires signed-in + active status + user id + session id', () => {
  assert.equal(active(state(sessionOf('u', 's', null))).active, true);
  assert.equal(active(state(sessionOf('u', 's', null, 'pending'))).active, false);
  assert.equal(active(state({ id: 's', status: 'active', user: null })).active, false);
  assert.equal(active({ isLoaded: true, isSignedIn: false, session: sessionOf('u', 's', null) }).active, false);
  assert.equal(active({ isLoaded: false, isSignedIn: false, session: null }).isLoaded, false);
});
test('terminal statuses are flagged so UI can purge, and are never active', () => {
  for (const status of ['expired', 'ended', 'abandoned', 'removed', 'replaced', 'revoked']) {
    const r = active(state(sessionOf('u', 's', null, status)));
    assert.equal(r.terminal, true, status); assert.equal(r.active, false, status);
  }
  assert.equal(active(state(sessionOf('u', 's', null, 'active'))).terminal, false);
});

// ---- account deletion policy ------------------------------------------------
const policyRaw = (await (async () => {
  const exports = {};
  vm.runInNewContext(compile(read('src/lib/accountDeletionPolicy.ts')), { exports, require: () => ({}) });
  return exports.getAccountDeletionUiPolicy;
})());
const policy = (x) => JSON.parse(JSON.stringify(policyRaw(x)));
test('deletion policy: no request or cancelled leaves the app fully usable', () => {
  for (const s of [null, undefined, 'cancelled']) assert.deepEqual(policy(s), { blocksBusinessUi: false, quarantineCandidateDeviceState: false, canCancel: false, terminal: false });
});
test('deletion policy: requested blocks business UI, quarantines device state, and is the only cancellable state', () => {
  assert.deepEqual(policy('requested'), { blocksBusinessUi: true, quarantineCandidateDeviceState: true, canCancel: true, terminal: false });
  for (const s of ['processing', 'failed', 'completed']) assert.equal(policy(s).canCancel, false, s);
});
test('deletion policy: every non-cancelled state blocks and quarantines; only completed is terminal', () => {
  for (const s of ['requested', 'processing', 'failed', 'completed']) {
    assert.equal(policy(s).blocksBusinessUi, true, s); assert.equal(policy(s).quarantineCandidateDeviceState, true, s);
  }
  assert.equal(policy('completed').terminal, true);
  assert.equal(policy('processing').terminal, false);
  assert.equal(policy('failed').terminal, false);
});
