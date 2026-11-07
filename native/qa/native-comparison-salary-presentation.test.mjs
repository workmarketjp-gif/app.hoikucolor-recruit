import assert from 'node:assert/strict';
import test from 'node:test';
import { comparisonSalaryLabel } from '../src/lib/comparisonSalaryPresentation.ts';
const job = (overrides = {}) => ({ salary_type: 'monthly', salary_min: null, salary_max: null, salary_note: null, ...overrides });

test('Web /compare salary: range includes original employment qualifier', () => {
  assert.equal(comparisonSalaryLabel(job({ salary_min: 220000, salary_max: 280000, salary_note: '賞与別途／実績により変動' })), '月給 220,000〜280,000円（賞与別途／実績により変動）');
});
test('Web /compare salary: min-only and max-only preserve units and qualifier', () => {
  assert.equal(comparisonSalaryLabel(job({ salary_type: 'hourly', salary_min: 1250, salary_note: '処遇改善加算含む' })), '時給 1,250円〜（処遇改善加算含む）');
  assert.equal(comparisonSalaryLabel(job({ salary_type: 'annual', salary_max: 3500000, salary_note: '規定による' })), '年収 〜3,500,000円（規定による）');
});
test('Web /compare salary: zero and same min/max are not silently rewritten', () => {
  assert.equal(comparisonSalaryLabel(job({ salary_min: 0, salary_max: 0 })), '月給 0〜0円');
  assert.equal(comparisonSalaryLabel(job({ salary_min: 200000, salary_max: 200000 })), '月給 200,000〜200,000円');
});
test('Web /compare salary: unknown salary unit does not assert monthly', () => {
  assert.equal(comparisonSalaryLabel(job({ salary_type: null, salary_min: 80000 })), '給与 80,000円〜');
});
test('Web /compare salary: note alone and genuine empty state are distinguished', () => {
  assert.equal(comparisonSalaryLabel(job({ salary_note: '規程により決定' })), '規程により決定');
  assert.equal(comparisonSalaryLabel(job()), '未掲載');
});
test('Non-finite numeric amounts are not displayed as fabricated pay', () => {
  assert.equal(comparisonSalaryLabel(job({ salary_min: NaN, salary_max: Infinity, salary_note: '詳細は面談' })), '詳細は面談');
});
