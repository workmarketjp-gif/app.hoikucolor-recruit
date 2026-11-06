// Behavioural suite: signed-out / first-launch bootstrap. Complements native-startup-contract.mjs
// (watchdogs, retry) with config failure, entry redirect, and auth-state transition behaviour.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const compile = (src, extra = '') => ts.transpileModule(src + extra, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function runtime(src, mocks, extraExports = '') {
  let cursor = 0;
  const states = [], effects = [], pending = [];
  const jsx = (type, props) => ({ type, props });
  const react = {
    Component: class {}, lazy: () => 'PrivateRuntime', Suspense: 'Suspense',
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps = []) { const i = cursor++; if (!effects[i] || deps.some((v, j) => v !== effects[i].deps[j])) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
  };
  const all = { react, 'react/jsx-runtime': { jsx, jsxs: jsx }, ...mocks };
  const exports = {};
  vm.runInNewContext(compile(src, extraExports), { exports, Error, Promise, require: (n) => all[n] ?? n, setTimeout: () => ({}), clearTimeout() {} });
  return { exports, render(name, props = {}) { cursor = 0; const tree = exports[name](props); while (pending.length) pending.shift()(); return tree; } };
}

// --- Entry screen routing -------------------------------------------------
function entry(auth) {
  const { exports, render } = runtime(read('src/app/index.tsx'), {
    '@clerk/expo': { useAuth: () => auth },
    'expo-router': { Redirect: 'Redirect' },
    'react-native': { ActivityIndicator: 'ActivityIndicator', View: 'View' },
  });
  return render('default');
}
test('entry shows a spinner, not a route, until auth has loaded', () => {
  const tree = entry({ isLoaded: false, isSignedIn: false });
  assert.equal(tree.type, 'View');
  assert.notEqual(tree.type, 'Redirect');
});
test('loaded signed-out entry goes to sign-in, never to private tabs', () => {
  const tree = entry({ isLoaded: true, isSignedIn: false });
  assert.equal(tree.type, 'Redirect');
  assert.equal(tree.props.href, '/(auth)/sign-in');
});
test('loaded signed-in entry goes to home', () => {
  assert.equal(entry({ isLoaded: true, isSignedIn: true }).props.href, '/(tabs)/home');
});

// --- Root layout ----------------------------------------------------------
function layout(auth, loadKey) {
  const events = [];
  const m = {
    '@clerk/expo': { ClerkProvider: 'ClerkProvider' }, '@clerk/expo/token-cache': { tokenCache: {} },
    'expo-router': { Stack: 'Stack' }, expo: { reloadAppAsync: async () => {} },
    'react-native': Object.fromEntries(['ActivityIndicator', 'Image', 'Pressable', 'Text', 'View'].map((x) => [x, x])),
    '../contexts/DocumentPickerCacheBoundary': { DocumentPickerCacheBoundary: 'CacheBoundary' },
    '../lib/clerkConfig': { loadHoikuColorClerkPublishableKey: loadKey ?? (async () => 'fixture-key') },
    '../lib/sessionLifecycle': { useActiveClerkSession: () => auth.current },
    '../lib/bootDiagnostics': { bootLog: (e) => events.push(e) },
    '../components/BuildDiagnostics': { BuildDiagnostics: 'BuildDiagnostics' },
  };
  const rt = runtime(read('src/app/_layout.tsx'), m, '\nexport { AuthScopedRuntime };');
  return { ...rt, events };
}
const text = (node) => !node || typeof node !== 'object' ? [String(node ?? '')] : [node.props?.title, node.props?.detail, ...[node.props?.children].flat(Infinity).flatMap(text)].filter(Boolean);

test('first paint is a neutral branded status, with no private runtime', () => {
  const h = layout({ current: { isLoaded: false } });
  const tree = h.render('default');
  assert.equal(tree.props.title, 'Hoiku Colorを準備しています…');
});
test('Clerk config failure shows a retryable config error, not a blank or private screen', async () => {
  const h = layout({ current: { isLoaded: false } }, async () => { throw new Error('network'); });
  h.render('default'); await new Promise((r) => setImmediate(r));
  const tree = h.render('default');
  assert.equal(tree.props.testID, 'clerk-config-missing');
  assert.match(tree.props.detail, /通信環境/);
  assert.ok(h.events.includes('HC_CLERK_CONFIG_FAILED'));
});
test('instance mismatch gets a distinct message that does not blame the network', async () => {
  const h = layout({ current: { isLoaded: false } }, async () => { throw new Error('CLERK_CONFIG_INSTANCE_MISMATCH'); });
  h.render('default'); await new Promise((r) => setImmediate(r));
  const tree = h.render('default');
  assert.equal(tree.props.testID, 'clerk-config-missing');
  assert.match(tree.props.detail, /一致しません/);
  assert.doesNotMatch(tree.props.detail, /通信環境/);
});
test('signed-out never mounts PrivateRuntime and reports ready', () => {
  let ready = 0;
  const h = layout({ current: { isLoaded: true, isSignedIn: false } });
  const tree = h.render('AuthScopedRuntime', { onReady() { ready++; }, onRetry() {} });
  assert.equal(tree.type.name, 'RouterStack');
  assert.equal(ready, 1);
  assert.notEqual(tree.type, 'Suspense');
});
test('signed-in but identity not yet active shows a safe holding state without private content', () => {
  const auth = { current: { isLoaded: true, isSignedIn: true, active: false, sessionId: null } };
  const h = layout(auth);
  const tree = h.render('AuthScopedRuntime', { onReady() { assert.fail('must not report ready'); }, onRetry() {} });
  assert.ok(text(tree).some((t) => /応募・メッセージ・書類は表示していません/.test(t)));
  assert.notEqual(tree.type, 'Suspense');
});
test('sign-in transition mounts PrivateRuntime only with the active session id; sign-out removes it', () => {
  const auth = { current: { isLoaded: true, isSignedIn: false } };
  const h = layout(auth);
  const props = { onReady() {}, onRetry() {} };
  assert.equal(h.render('AuthScopedRuntime', props).type.name, 'RouterStack');
  auth.current = { isLoaded: true, isSignedIn: true, active: true, sessionId: 'session-A' };
  const signedIn = h.render('AuthScopedRuntime', props);
  assert.equal(signedIn.props.children.type, 'PrivateRuntime');
  assert.equal(signedIn.props.children.props.sessionId, 'session-A');
  auth.current = { isLoaded: true, isSignedIn: true, active: true, sessionId: 'session-B' };
  assert.equal(h.render('AuthScopedRuntime', props).props.children.props.sessionId, 'session-B', 'account switch passes the new session id');
  auth.current = { isLoaded: true, isSignedIn: false };
  assert.equal(h.render('AuthScopedRuntime', props).type.name, 'RouterStack', 'sign-out unmounts private runtime');
});
test('boot diagnostics never include identifiers', () => {
  const h = layout({ current: { isLoaded: true, isSignedIn: true, active: true, sessionId: 'session-SECRET' } });
  h.render('AuthScopedRuntime', { onReady() {}, onRetry() {} });
  assert.ok(h.events.length > 0);
  assert.ok(h.events.every((e) => /^HC_[A-Z_]+$/.test(e)));
});
