import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const nativeRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const screen = read('../src/app/compare.tsx');
const web = read('../../src/views/CompareView.tsx');
const webStyles = read('../../src/views/views.css');
const helper = read('../src/lib/comparisonSalaryPresentation.ts');

for (const fragment of [
  'comparisonSalaryLabel(job)',
  '横にスクロールして比較できます',
  '求人文面に明示された表現だけを確認',
  '求人文面の明示のみ',
  'styles.workplaceBadge',
  'styles.financeBadge',
  'styles.matchBadge',
  'accessibilityLabel={`${job.facility_name}を比較から外す`}',
  'readCandidateFreshlyVerifiedView(',
  'listRankedJobs(pinned.client)',
]) {
  assert.ok(screen.includes(fragment), 'Native compare integration: ' + fragment);
}
assert.ok(!screen.includes('function salary(job:'), 'old incorrect salary formatter removed');
for (const fragment of ['salary_note', '給与', '勤務実績', '会計実績', '比較する求人']) {
  assert.ok(web.includes(fragment), 'Web comparison reference: ' + fragment);
}
for (const fragment of ['#e9f8f1', '#16714a', '#edf3ff', '#365eac']) {
  assert.ok(webStyles.includes(fragment), 'Web evidence palette: ' + fragment);
  assert.ok(screen.includes(fragment), 'Native evidence palette: ' + fragment);
}
assert.match(helper, /job\.salary_note\s*\?/);
const test = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-comparison-salary-presentation.test.mjs',
], { cwd: nativeRoot, encoding: 'utf8' });
if (test.status !== 0) {
  process.stdout.write(test.stdout + test.stderr);
  throw new Error('Comparison salary behavior regression failed');
}
console.log('PASS: Web comparison source, Native row/legend interactions and salary tests');
