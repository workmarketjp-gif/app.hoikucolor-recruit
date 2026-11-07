import assert from 'node:assert/strict';
import test from 'node:test';
import { visibleComparisonMetricKeys } from '../src/lib/comparisonVerifiedRowVisibility.ts';

const metric = (value) => ({ value, label: '検証された値', unit: '%', sample_size: 2 });
const job = (workplace = null, finance = null) => ({
  verified_workplace: workplace === null ? null : { verified_metrics: workplace },
  verified_finance: finance === null ? null : { verified_metrics: finance },
});
const workplaceKeys = ['average_monthly_overtime_hours', 'paid_leave_usage_rate_pct'];
const financeKeys = ['finance_closed_months_12m', 'finance_positive_month_ratio_pct'];

test('Web /compare hides all-null verified rows rather than showing a wall of empty rows', () => {
  assert.deepEqual(visibleComparisonMetricKeys([job(), job()], 'workplace', workplaceKeys), []);
  assert.deepEqual(visibleComparisonMetricKeys([job(), job()], 'finance', financeKeys), []);
});

test('one published value reveals its row for every compared job while retaining Web priority', () => {
  const a = job({ paid_leave_usage_rate_pct: metric(80) });
  const b = job({ average_monthly_overtime_hours: metric(3) });
  assert.deepEqual(visibleComparisonMetricKeys([a, b], 'workplace', workplaceKeys), workplaceKeys);
});

test('zero is a published numeric observation and cannot be confused with missing', () => {
  assert.deepEqual(visibleComparisonMetricKeys([job({ average_monthly_overtime_hours: metric(0) })], 'workplace', workplaceKeys), [workplaceKeys[0]]);
});

test('missing value and explicitly null value are not verified metrics', () => {
  assert.deepEqual(visibleComparisonMetricKeys([job({ average_monthly_overtime_hours: { unit: '時間' }, paid_leave_usage_rate_pct: metric(null) })], 'workplace', workplaceKeys), []);
});

test('finance observations never become workplace observations', () => {
  const a = job(null, { finance_closed_months_12m: metric(12) });
  assert.deepEqual(visibleComparisonMetricKeys([a], 'workplace', workplaceKeys), []);
  assert.deepEqual(visibleComparisonMetricKeys([a], 'finance', financeKeys), ['finance_closed_months_12m']);
});

test('workplace observations never become finance observations', () => {
  const a = job({ paid_leave_usage_rate_pct: metric(90) }, null);
  assert.deepEqual(visibleComparisonMetricKeys([a], 'finance', financeKeys), []);
});

test("a metric’s sample size, profile quality and label alone do not establish a value", () => {
  const a = job({ paid_leave_usage_rate_pct: { label: '有給', sample_size: 3 } });
  a.verified_workplace.quality_points = 99;
  assert.deepEqual(visibleComparisonMetricKeys([a], 'workplace', workplaceKeys), []);
});

test('empty selection and priority list show no rows', () => {
  assert.deepEqual(visibleComparisonMetricKeys([], 'workplace', workplaceKeys), []);
  assert.deepEqual(visibleComparisonMetricKeys([job({ paid_leave_usage_rate_pct: metric(90) })], 'workplace', []), []);
});
