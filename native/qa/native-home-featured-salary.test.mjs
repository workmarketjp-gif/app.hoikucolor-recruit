import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homeFeaturedSalary } from '../src/lib/homeFeaturedSalary.ts';
const source = readFileSync(new URL('../src/components/FeaturedHomeJobs.tsx', import.meta.url), 'utf8');

const job = { salary_type: 'hourly', salary_min: 1250, salary_max: 1250, salary_note: '1,250円〜1,250円', is_external: true };
test('imported hourly salary prefers canonical amount with unit over raw note', () => {
  assert.equal(homeFeaturedSalary(job), '時給 1,250円');
  assert.equal(homeFeaturedSalary({ ...job, salary_max: 1800 }), '時給 1,250〜1,800円');
});
test('internal facility can use its stated salary note', () => {
  assert.equal(homeFeaturedSalary({ ...job, is_external: false, salary_note: '経験に応じて相談' }), '経験に応じて相談');
});
test('unknown or invalid salary never invents a number', () => {
  assert.equal(homeFeaturedSalary({ ...job, salary_min: null, salary_note: null }), '給与は詳細をご確認ください');
  assert.equal(homeFeaturedSalary({ ...job, salary_min: 0, salary_note: null }), '給与は詳細をご確認ください');
  assert.equal(homeFeaturedSalary({ ...job, salary_min: 1250, salary_max: 1000 }), '時給 1,250円〜');
});
test('component displays the same canonical salary on the Home card', () => {
  assert.match(source, /<Text style=\{styles\.salary\}>\{homeFeaturedSalary\(job\)\}<\/Text>/);
  assert.doesNotMatch(source, /salary\(job\) \? <Text/);
});
