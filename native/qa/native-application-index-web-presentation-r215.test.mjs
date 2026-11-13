/** Source-level parity check only; MUST NOT be reported as rendered Native QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const tsxPath = new URL('../native/src/app/(tabs)/applications.tsx', root);
const source = readFileSync(tsxPath, 'utf8');
const required = (token) => { assert.ok(source.includes(token), `missing ${token}`); };

test('actual TSX source parses as TypeScript JSX without diagnostics', () => {
  const ts = require('typescript');
  const file = ts.createSourceFile('applications.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(file.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});
test('no duplicated Web shell heading in body', () => {
  assert.ok(!source.includes('<Text style={styles.title}>応募管理</Text>'));
  required('accessibilityLabel="応募管理の一覧を更新"');
});
test('card follows current Web application row order', () => {
  const start = source.indexOf('<View style={styles.cardRow}>');
  assert.ok(start > 0);
  const section = source.slice(start, start + 1300);
  const positions = ['styles.status', 'styles.facility', 'styles.jobTitle', 'styles.meta'].map(t => section.indexOf(t));
  assert.ok(positions.every(n => n >= 0));
  assert.ok(positions.every((n,i) => i === 0 || positions[i-1] < n));
  required('status: { alignSelf:');
  required('facility: { fontSize: 17');
  required('jobTitle: { fontSize: 15');
  required('meta: { fontSize: 14');
});
test('existing canonical candidate read and navigation lease remain wired', () => {
  required('readCandidateApplicationIndex({');
  required('messageNavigationLeaseIsCurrent({');
  required('usePrivateScreenCapture(\'applications\')');
  required('privacy.canAccessPrivateData()');
});
test('failed private data read exposes no raw transport error text', () => {
  required('応募情報を取得できませんでした。通信状態を確認して再読み込みしてください。');
  assert.ok(!source.includes('String((loadError'));
  required('再読み込み');
});
test('error retry and refresh use existing read-only load, not a mutation', () => {
  required('style={styles.retry} accessibilityRole="button" onPress={() => void load(true)}');
  required('style={styles.refresh} onPress={() => void load(true)}');
});
test('empty state and visit link align with actual Web copy', () => {
  required('気になる園を見つけたら、求人から応募できます。');
  required('見学・体験の予定を見る');
  required('の応募詳細を開く` }'.replace('` }','`}'));
});
test('brand, card and touch target values follow Web source', () => {
  for (const token of ["'#FBF7F6'", "'#ECE6E4'", "'#E72346'", 'minHeight: 48', 'minHeight: 56', 'borderRadius: 18']) required(token);
});
