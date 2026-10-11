import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source + '\nexport { AuthScopedRuntime };', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function harness(auth = { isLoaded: false }) {
  let cursor = 0, clock = 0, reloads = 0;
  const states = [], effects = [], pending = [], timers = new Map(), events = [];
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  const mocks = {
    react: {
      Component: class {}, lazy: () => 'PrivateRuntime', Suspense: 'Suspense',
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => { states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
      useCallback(fn) { cursor++; return fn; },
      useEffect(fn, deps) { const i = cursor++; if (!effects[i] || deps.some((v, j) => v !== effects[i].deps[j])) pending.push(() => { effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; }); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@clerk/expo': { ClerkProvider: 'ClerkProvider' },
    '@clerk/expo/token-cache': { tokenCache: {} },
    'expo-router': { Stack: 'Stack' },
    expo: { reloadAppAsync: async () => { reloads++; } },
    'react-native': Object.fromEntries(['ActivityIndicator', 'Image', 'Pressable', 'Text', 'View'].map(x => [x, x])),
    '../contexts/DocumentPickerCacheBoundary': { DocumentPickerCacheBoundary: 'CacheBoundary' },
    '../lib/clerkConfig': { loadHoikuColorClerkPublishableKey: async () => 'fixture-key' },
    '../lib/sessionLifecycle': { useActiveClerkSession: () => auth },
    '../lib/bootDiagnostics': { bootLog: event => events.push(event) },
    '../components/BuildDiagnostics': { BuildDiagnostics: 'BuildDiagnostics' },
  };
  vm.runInNewContext(compiled, { exports, require: name => mocks[name] ?? name,
    setTimeout(fn, delay) { const id = {}; timers.set(id, { at: clock + delay, fn }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const render = (name = 'default', props = {}) => { cursor = 0; const tree = exports[name](props); while (pending.length) pending.shift()(); return tree; };
  const advance = ms => { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.fn(); } };
  return { render, advance, events, get reloads() { return reloads; } };
}
{
  // Never invoke Clerk's children: suspension/cache blockage cannot suppress the root timer.
  const h = harness(); h.render(); await Promise.resolve();
  const providerTree = h.render(); assert.equal(providerTree.type.name, 'StartupErrorBoundary');
  h.advance(16999); assert.notEqual(h.render().props.testID, 'clerk-load-timeout');
  h.advance(1); const error = h.render(); assert.equal(error.props.testID, 'clerk-load-timeout');
  error.props.onAction(); await Promise.resolve(); assert.equal(h.reloads, 1);
  assert(h.events.includes('HC_CLERK_LOAD_TIMEOUT'));
}
{
  const h = harness(); h.render(); await Promise.resolve();
  const tree = h.render();
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(all)];
  all(tree).find(n => n.type?.name === 'AuthScopedRuntime').props.onReady();
  h.render(); h.advance(20000);
  assert.notEqual(h.render().props.testID, 'clerk-load-timeout', 'ready startup must cancel outer deadline');
}
{
  const h = harness({ isLoaded: false }); const props = { onReady() {}, onRetry() {} };
  h.render('AuthScopedRuntime', props); h.advance(10000);
  assert.equal(h.render('AuthScopedRuntime', props).props.testID, 'clerk-load-timeout');
}
{
  let ready = 0;
  const h = harness({ isLoaded: true, isSignedIn: false });
  const tree = h.render('AuthScopedRuntime', { onReady() { ready++; }, onRetry() {} });
  assert.equal(tree.type.name, 'RouterStack'); assert.equal(ready, 1);
  assert(h.events.includes('HC_CLERK_SIGNED_OUT'));
}
{
  const h = harness({ isLoaded: true, isSignedIn: true, active: true, sessionId: 'fixture-session' });
  const tree = h.render('AuthScopedRuntime', { onReady() {}, onRetry() {} });
  assert.equal(tree.props.children.type, 'PrivateRuntime');
  assert.equal(tree.props.children.props.sessionId, 'fixture-session');
}
{
  const h = harness({ isLoaded: true, isSignedIn: true, active: false });
  const props = { onReady() { assert.fail('inactive identity must not clear deadline'); }, onRetry() {} };
  h.render('AuthScopedRuntime', props); h.advance(10000);
  assert.equal(h.render('AuthScopedRuntime', props).props.testID, 'clerk-load-timeout');
}
assert(source.includes('reloadAppAsync()'));
console.log('PASS startup: outer watchdog, SDK/cache non-render, unloaded/inactive timeout, signed-out/private routing, fresh JS retry');
