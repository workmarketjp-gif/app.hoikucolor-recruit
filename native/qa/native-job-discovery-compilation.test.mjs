import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const saved = readFileSync(new URL('../src/app/(tabs)/saved.tsx', import.meta.url), 'utf8');
const jobs = readFileSync(new URL('../src/app/(tabs)/jobs.tsx', import.meta.url), 'utf8');

for (const [name, source] of [['saved', saved], ['jobs', jobs]]) {
  test(name + ' screen parses as real TSX without syntax errors', () => {
    const ast = ts.createSourceFile(name + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const errors = ast.parseDiagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    assert.deepEqual(errors, []);
  });
}

test('saved screen has an initialized owner and the pinned-session hook', () => {
  assert.match(saved, /const ownerKey = candidateViewOwnerKey\(session\?\.user\?\.id, session\?\.id\)/);
  assert.match(saved, /const \{ pinCandidateAction \} = usePinnedCandidateAction\(\)/);
  assert.doesNotMatch(saved, /candidateViewOwnerKe\s+const/);
  assert.doesNotMatch(saved, /removeError\)\s*\}\)/);
});

test('job cards require canonical saved readback, not optimistic state', () => {
  assert.match(jobs, /updateSavedJobAndConfirm\(/);
  assert.match(jobs, /listSavedJobIds\(pinned\.client\)/);
  assert.doesNotMatch(jobs, /value:\s*currentlySaved\s*\?/);
  assert.match(jobs, /requestGeneration !== generation\.current/);
});

test('live keyword changes invalidate previous results before debounced search', () => {
  assert.match(jobs, /const editQuery = \(value: string\)/);
  assert.match(jobs, /generation\.current \+= 1;\s*setOwnedJobs\(null\)/);
  assert.match(jobs, /value\.trim\(\) \? 250 : 0/);
  assert.match(jobs, /cancelKeywordTimer\(\);\s*void load\(true, query\)/);
});
