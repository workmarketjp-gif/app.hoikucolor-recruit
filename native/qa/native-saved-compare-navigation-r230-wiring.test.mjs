import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const saved = readFileSync(new URL('../src/app/(tabs)/saved.tsx', import.meta.url),'utf8');
const selection = readFileSync(new URL('../src/lib/comparisonSelection.ts', import.meta.url),'utf8');
test('saved cards and compare share one synchronous navigation lease', () => {
  assert.match(saved,/const navigateVerifiedSavedRoute = async/);
  assert.match(saved,/navigationBusyRef\.current = true/);
  assert.match(saved,/const navigationId = \+\+navigationSequence\.current/);
  assert.match(saved,/await navigateVerifiedSavedRoute\(route, jobId\)/);
  assert.match(saved,/await navigateVerifiedSavedRoute\(route, 'compare'\)/);
  assert.match(saved,/onPress=\{\(\) => void compare\(\)\}/);
  assert.doesNotMatch(saved,/router\.push\(\('\/compare\?'/);
});
test('session pin and generation fence precede compare navigation', () => {
  assert.match(saved,/candidateViewOwnerKey\(pinned\.ownerId, pinned\.ownerSessionId\) !== ownerKey/);
  assert.match(saved,/!canPresent\(ownerKey, requestGeneration\)/);
  assert.match(saved,/navigationId !== navigationSequence\.current/);
  assert.match(saved,/if \(!navigated && navigationId === navigationSequence\.current\)/);
  assert.match(saved,/openingId === 'compare' \? '比較画面を開いています…'/);
});
test('comparison path can only contain validated canonical saved job ids', () => {
  assert.match(saved,/savedComparisonRoute\(jobs\?\.slice\(0, 3\)\.map\(\(job\) => job\.id\) \?\? \[\]\)/);
  assert.match(selection,/requestedComparisonJobIds\(savedJobIds\)/);
  assert.match(selection,/if \(ids\.length < 2\) return null/);
});
