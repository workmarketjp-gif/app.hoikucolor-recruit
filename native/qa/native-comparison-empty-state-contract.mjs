import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const web = read('../../src/views/CompareView.tsx');
const native = read('../src/app/compare.tsx');

// Existing Web behavior, not a redesigned or guessed Native empty state.
for (const text of [
  '現在比較できる公開求人がありません',
  '求人が公開されると、ここから2〜3件を選んで比較できます。',
  'action="求人を探す" href="/jobs"',
]) {
  assert.ok(web.includes(text), 'Web /compare reference absent: ' + text);
}
for (const text of [
  'jobs.length === 0 ? (',
  '現在比較できる公開求人がありません',
  '求人が公開されると、ここから2〜3件を選んで比較できます。',
  'accessibilityRole="button"',
  'onPress={() => router.push(\'/(tabs)/jobs\')}',
  'readCandidateFreshlyVerifiedView(',
  'if (!snapshot) {',
  'if (!ownerKey || privacy.shieldVisible)',
]) {
  assert.ok(native.includes(text), 'Native /compare empty-state or privacy wiring absent: ' + text);
}
assert.match(native, /!loading\s*&&\s*jobs\.length\s*>\s*0\s*&&\s*compared\.length\s*<\s*2/,
  'The 2-job hint must not appear when the authorized job list is empty');
assert.ok(!native.includes('visibleComparisonMetricKeys('),
  'Do not silently change the existing Web verified-row visibility contract');
console.log('PASS: Web-authorized comparison empty state, native job-search action and private/error boundaries');
