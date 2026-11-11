import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { keywordForCurrentCandidate } from '../src/lib/jobSearchKeywordDraft.ts';

const screenPath = new URL('../src/app/(tabs)/jobs.tsx', import.meta.url);

function nativeScreen() {
  return readFileSync(screenPath, 'utf8');
}

test('keyboard and button query use the last input event before a React rerender', () => {
  const key = 'synthetic-user:synthetic-session';
  assert.equal(keywordForCurrentCandidate(key, { ownerKey: key, value: '保育園' }, '保育'), '保育園');
});

test('old candidate search draft cannot leak into a new candidate session', () => {
  assert.equal(keywordForCurrentCandidate('user-b:session-b', {
    ownerKey: 'user-a:session-a', value: '私的な検索語',
  }, ''), '');
});

test('typing invalidates prior responses but keeps manual search enabled during debounce', () => {
  const screen = nativeScreen();
  const edit = screen.split('const editQuery = (value: string) => {')[1]
    ?.split('const [ownedFilters,')[0];
  assert.ok(edit, 'cannot find the real Native keyword edit handler');
  assert.match(edit, /generation\.current \+= 1;/);
  assert.match(edit, /setOwnedJobs\(null\);/);
  assert.match(edit, /setOwnedSavedIds\(null\);/);
  assert.match(edit, /setLoading\(false\);\s*keywordTimer\.current = setTimeout/);
  assert.doesNotMatch(edit, /setLoading\(true\);\s*keywordTimer\.current = setTimeout/);
});

test('explicit keyboard search blocks duplicate in-flight submissions, CTA stays guarded', () => {
  const screen = nativeScreen();
  assert.match(screen, /onSubmitEditing=\{\(\) => \{\s*if \(!canStartManualJobSearch\(generation\.current, inFlightSearchGeneration\.current, ownerKey,/);
  assert.match(screen, /inFlightSearchGeneration\.current = currentGeneration;/);
  assert.match(screen, /if \(inFlightSearchGeneration\.current === currentGeneration\) inFlightSearchGeneration\.current = null;/);
  assert.match(screen, /const manualSearchDisabled = !canStartManualJobSearch\(\s*generation\.current, inFlightSearchGeneration\.current, ownerKey,/);
  const cta = screen.match(/<Pressable testID="job-search-submit"[\s\S]*?<\/Pressable>/)?.[0] ?? '';
  assert.match(cta, /disabled=\{manualSearchDisabled\}/);
  assert.doesNotMatch(cta, /disabled=\{loading\}/);
  assert.match(screen, /\(loading \|\| \(visibleJobs === null && !error\)\) && jobs\.length === 0/);
  assert.match(screen, /!loading && !error && visibleJobs !== null && jobs\.length === 0/);
});
