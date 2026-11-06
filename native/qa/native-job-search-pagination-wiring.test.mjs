import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../src/app/(tabs)/jobs.tsx', import.meta.url), 'utf8');
// Wiring assertions are supplemental; the pure behavior is tested in the sibling
// job-search-failure-channel.test.mjs test. They do not prove React Native UI runtime.
test('pagination error is separate from the initial-search error and owner-scoped', () => {
  assert.match(screen, /jobSearchFailureChannel\(\{/);
  assert.match(screen, /requestedOwner: latestOwnerRef\.current/);
  assert.match(screen, /privateAllowed: latestPrivateState\.current\.allowed && !latestPrivateState\.current\.shieldVisible/);
  assert.match(screen, /if \(channel === 'pagination' && ownerKey\)/);
  assert.match(screen, /setOwnedPageError\(\{ ownerKey, value:/);
  assert.match(screen, /else if \(channel === 'initial' && ownerKey\)/);
});
test('editing, reset and account privacy transitions clear failed-page state', () => {
  assert.match(screen, /setOwnedPageError\(null\);/);
  assert.ok((screen.match(/setOwnedPageError\(null\);/g) ?? []).length >= 4);
  assert.match(screen, /setOwnedJobs\(null\);\s*setOwnedSavedIds\(null\);/);
});
test('previous results are visible with an explicit next-page retry', () => {
  assert.match(screen, /\{pageError && visibleJobs !== null \?/);
  assert.match(screen, /testID="job-pagination-retry"/);
  assert.match(screen, /onPress=\{\(\) => void load\(false\)\}/);
  assert.match(screen, /\{hasMore && visibleJobs !== null && !pageError \?/);
});
test('the existing Web search to spot-work destination remains available', () => {
  assert.match(screen, /1日だけのスポット勤務を探す/);
  assert.match(screen, /router\.push\('\/spot-jobs' as never\)/);
});
