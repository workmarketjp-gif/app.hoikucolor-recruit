import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source-wiring regressions only; this is NOT React Navigation runtime evidence.
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const messages = source('../src/app/messages.tsx');
const applications = source('../src/app/(tabs)/applications.tsx');
const saved = source('../src/app/(tabs)/saved.tsx');

for (const [label, code] of [['messages', messages], ['applications', applications], ['saved', saved]]) {
  test(`${label} re-reads canonical server state on navigation focus`, () => {
    assert.match(code, /useFocusEffect\(useCallback\(\(\) => \{/);
    assert.match(code, /void load\(\);/);
    assert.doesNotMatch(code, /useEffect\(\(\) => \{/);
  });
}
test('messages cancel in-flight attention + application reads on blur', () => {
  assert.match(messages, /generation\.current \+= 1;\s*freshlyVerifiedOwner\.current = null;\s*\};\s*\}, \[ownerKey/);
});
test('application list revokes read lease on blur and refuses background read results', () => {
  assert.match(applications, /generation\.current \+= 1;\s*freshlyVerifiedOwner\.current = null;\s*\};\s*\}, \[ownerKey/);
  assert.match(applications, /!privacy\.canAccessPrivateData\(\)\) return;/);
});
test('saved jobs clear prior rows immediately on blur', () => {
  assert.match(saved, /return \(\) => \{\s*generation\.current \+= 1;\s*setOwnedJobs\(null\);\s*setOwnedError\(null\);/);
});
test('an old saved-job mutation cannot unlock a newer request', () => {
  assert.match(saved, /const mutationId = \+\+mutationSequence\.current;/);
  assert.match(saved, /if \(mutationId === mutationSequence\.current\)/);
  assert.match(saved, /focusedOwnerRef\.current !== ownerKey/);
});
test('a pending unfocused unsave settles through a new canonical read after returning', () => {
  assert.match(saved, /focusActiveRef\.current = false;/);
  assert.match(saved, /privateVisibleRef\.current && focusActiveRef\.current\) \{/);
  assert.match(saved, /void load\(\);/);
});
