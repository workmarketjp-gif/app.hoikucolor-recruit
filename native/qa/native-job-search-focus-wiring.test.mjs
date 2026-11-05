import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Source-wiring checks; not a React Navigation / Android / iOS runtime test.
const jobs = readFileSync(new URL('../src/app/(tabs)/jobs.tsx', import.meta.url), 'utf8');
const focusStart = jobs.indexOf('  useFocusEffect(useCallback(() => {');
const focusEnd = jobs.indexOf('  // App Lock and foreground revalidation', focusStart);
const focus = jobs.slice(focusStart, focusEnd);

test('job search uses a stable focus callback rather than dependency on load result state', () => {
  assert.ok(focusStart > -1 && focusEnd > focusStart);
  assert.match(focus, /shouldRefreshJobsOnReturn\(/);
  assert.match(focus, /void latestLoad\.current\(true\)/);
  assert.match(focus, /\}, \[ownerKey\]\)\)/);
  assert.doesNotMatch(focus, /\[load\]/);
});
test('leaving the search revokes stale result leases and cancels unsubmitted debounce', () => {
  assert.match(focus, /return \(\) => \{/);
  assert.match(focus, /cancelKeywordTimer\(\);\s*generation\.current \+= 1;/);
  assert.match(focus, /setOwnedJobs\(null\);\s*setOwnedSavedIds\(null\);/);
  assert.doesNotMatch(focus, /setOwnedQuery\(null\)|setOwnedFilters\(null\)/);
});
test('App Lock and new session still reset private search drafts', () => {
  assert.match(jobs, /setOwnedQuery\(null\);\s*setOwnedFilters\(null\)/);
  assert.match(jobs, /if \(privacy\.shieldVisible \|\| !ownerKey\)/);
});
test('write acknowledgement arriving after screen return requires canonical re-read', () => {
  assert.match(jobs, /focusActive\.current && requestGeneration !== generation\.current && ownerKey/);
  assert.match(jobs, /void latestLoad\.current\(true\)/);
});
