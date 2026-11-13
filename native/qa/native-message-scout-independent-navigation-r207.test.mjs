import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pinCandidateForRead } from '../src/lib/pinnedCandidateRead.ts';
import { candidateViewOwnerKey } from '../src/lib/candidateViewOwner.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../src/app/messages.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('messages.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0, 'real candidate message TSX must parse');
let arrow;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'openScoutsWithoutInbox') arrow = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(arrow && ts.isArrowFunction(arrow), 'independent route handler must be present in real Native screen');
const js = ts.transpileModule('const openScoutsWithoutInbox = ' + arrow.getText(ast) + ';', {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
const make = new Function('ownerKey', 'generation', 'canRead', 'visibleApplications',
  'threadOpenPending', 'secondaryNavigationPending', 'secondaryNavigationRequest',
  'privacy', 'setNavigatingSecondary', 'setThreadOpenError', 'pinCandidateForRead',
  'pinCandidateAction', 'candidateViewOwnerKey', 'router',
  js + '\nreturn openScoutsWithoutInbox;');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
function fixture(options = {}) {
  const pushes = [], errors = [], busy = [];
  const generation = { current: 4 };
  const secondaryNavigationPending = { current: false };
  const secondaryNavigationRequest = { current: 0 };
  const threadOpenPending = { current: false };
  let allowed = true; let pinCalls = 0;
  const pinCandidateAction = async () => {
    pinCalls++;
    return options.pin ? options.pin() : {
      isCurrent: () => allowed,
      ownerId: 'synthetic-user-A', ownerSessionId: 'synthetic-session-A',
    };
  };
  const handler = make(candidateViewOwnerKey('synthetic-user-A','synthetic-session-A'),
    generation, options.canRead ?? true, options.applications ?? null,
    threadOpenPending, secondaryNavigationPending, secondaryNavigationRequest,
    {canAccessPrivateData: () => allowed}, value => busy.push(value), value => errors.push(value),
    pinCandidateForRead, pinCandidateAction, candidateViewOwnerKey,
    {push: path => {if (options.throwRouter) throw Error('synthetic router failure'); pushes.push(path);}});
  return {
    handler, pushes, errors, busy, generation, secondaryNavigationPending,
    secondaryNavigationRequest, threadOpenPending,
    get pinCalls() {return pinCalls;},
    revoke: () => {allowed = false; generation.current++; secondaryNavigationRequest.current++;},
  };
}

test('when application index fails, scouts still opens with independently pinned session and no fabricated count', async () => {
  const f = fixture();
  await f.handler();
  assert.deepEqual(f.pushes, ['/scouts']);
  assert.equal(f.pinCalls, 1);
  assert.equal(f.secondaryNavigationPending.current, true, 'stay locked until blur');
  assert.deepEqual(f.busy, [true]);
  assert.match(source, /\/scouts'\) : void openScoutsWithoutInbox\(\)/);
  assert.doesNotMatch(arrow.getText(ast), /listApplications|listScouts|sendApplicationMessage|submitApplication/);
  assert.match(source, /<>\s*<Text style=\{styles\.section\}>園からのスカウト/);
});

test('a second tap cannot launch another Clerk token pin or route push', async () => {
  const waiter = deferred(); const f = fixture({pin: () => waiter.promise});
  const first = f.handler(), second = f.handler();
  await Promise.resolve(); await Promise.resolve();
  waiter.resolve({ownerId:'synthetic-user-A',ownerSessionId:'synthetic-session-A',isCurrent:()=>true});
  await Promise.all([first,second]);
  assert.equal(f.pinCalls,1);
  assert.deepEqual(f.pushes,['/scouts']);
});

test('a switched account is never allowed through independent scouts navigation', async () => {
  const f = fixture({pin: async () => ({ownerId:'synthetic-user-B',ownerSessionId:'synthetic-session-B',isCurrent:()=>true})});
  await f.handler();
  assert.deepEqual(f.pushes,[]);
  assert.equal(f.secondaryNavigationPending.current,false);
});

test('late old-session token cannot navigate or unlock a newer navigation lease', async () => {
  const waiter=deferred(); const f=fixture({pin:()=>waiter.promise});
  const pending=f.handler(); await Promise.resolve(); await Promise.resolve();
  f.revoke();
  f.secondaryNavigationPending.current=true;
  waiter.resolve({ownerId:'synthetic-user-A',ownerSessionId:'synthetic-session-A',isCurrent:()=>true});
  await pending;
  assert.deepEqual(f.pushes,[]);
  assert.equal(f.secondaryNavigationPending.current,true, 'old completion must not reset newer lease');
});

test('App Lock blocks the route before any token retrieval starts', async () => {
  const f=fixture({canRead:false});
  await f.handler(); assert.deepEqual(f.pushes,[]); assert.equal(f.pinCalls,0);
});

test('synchronous navigation failure releases only its own gate and surfaces retryable error', async () => {
  const f=fixture({throwRouter:true});
  await f.handler();
  assert.deepEqual(f.pushes,[]);
  assert.equal(f.secondaryNavigationPending.current,false);
  assert.match(f.errors.at(-1), /スカウトを開けませんでした/);
  assert.deepEqual(f.busy,[true,false]);
});

test('confirmed inbox keeps original synchronous route action; unverified alternative cannot bypass it', async () => {
  const f=fixture({applications:[]});
  await f.handler(); assert.equal(f.pinCalls,0);assert.deepEqual(f.pushes,[]);
  assert.match(source, /visibleApplications && !error \? navigateInboxDestination\('\/scouts'\)/);
});
