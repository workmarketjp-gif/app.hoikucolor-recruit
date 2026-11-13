import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { retainApplicationListForRefresh } from '../src/lib/applicationListRefreshPolicy.ts';

const base = { explicitRefresh: true, ownerKey: '["candidate-a","session-a"]', freshlyVerifiedOwnerKey: '["candidate-a","session-a"]', privateAllowed: true };

test('manual refresh retains canonical rows for same verified foreground candidate', () => {
  assert.equal(retainApplicationListForRefresh(base), true);
});

test('focus re-entry always invalidates previous rows pending fresh read', () => {
  assert.equal(retainApplicationListForRefresh({ ...base, explicitRefresh: false }), false);
});

test('App Lock or background forbids retaining private application rows', () => {
  assert.equal(retainApplicationListForRefresh({ ...base, privateAllowed: false }), false);
});

test("candidate or session switch never retains another account's list", () => {
  for (const ownerKey of [null, '["candidate-b","session-a"]', '["candidate-a","session-b"]']) {
    assert.equal(retainApplicationListForRefresh({ ...base, ownerKey }), false);
  }
  assert.equal(retainApplicationListForRefresh({ ...base, freshlyVerifiedOwnerKey: null }), false);
});

test('actual Native screen distinguishes explicit retry from focus reload', () => {
  const source = readFileSync(new URL('../src/app/(tabs)/applications.tsx', import.meta.url), 'utf8');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const ast = ts.createSourceFile('applications.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(x => ts.flattenDiagnosticMessageText(x.messageText, '\n')), []);
  assert.match(source, /retainApplicationListForRefresh\(\{/);
  assert.match(source, /if \(!retainRows\) freshlyVerifiedOwner\.current = null/);
  assert.match(source, /if \(!retainRows\) setOwnedApplications\(null\)/);
  assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{/);
  assert.match(source, /void load\(\);/);
  assert.equal((source.match(/onPress=\{\(\) => void load\(true\)\}/g) ?? []).length, 2);
  assert.match(source, /前回確認できた応募一覧を表示しています/);
  assert.match(source, /flexWrap: 'wrap'/);
});
