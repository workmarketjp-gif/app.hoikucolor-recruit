import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonVerifiedMetric } from '../src/lib/comparisonVerifiedEvidence.ts';

const workplaceKey = 'average_monthly_overtime_hours';
const financeKey = 'finance_closed_months_12m';
const workplace = (overrides = {}, metricOverrides = {}) => ({
  verified_metric_count: 1,
  verified_metrics: { [workplaceKey]: {
    label: '平均時間外労働', value: 3.5, unit: '時間',
    sample_size: 14, source: 'ho_verified', ...metricOverrides,
  } },
  ...overrides,
});
const finance = (overrides = {}, metricOverrides = {}) => ({
  verified_metric_count: 1,
  verified_metrics: { [financeKey]: {
    label: '月次締め実績', value: 10, unit: 'か月',
    sample_size: 10, source: 'hf_verified', ...metricOverrides,
  } },
  ...overrides,
});
const job = (ho = null, hf = null) => ({ verified_workplace: ho, verified_finance: hf });

test('legitimate workplace evidence retains canonical value, unit, label, record count', () => {
  assert.deepEqual(comparisonVerifiedMetric(job(workplace()), 'workplace', workplaceKey), {
    label: '平均時間外労働', displayValue: '3.5時間\n14件の記録から集計',
  });
});
test('legitimate finance data retains months as months, never converts to job facts', () => {
  assert.deepEqual(comparisonVerifiedMetric(job(null, finance()), 'finance', financeKey), {
    label: '月次締め実績', displayValue: '10か月\n10か月分の記録から集計',
  });
});
test('missing actual metrics, no verified count, or unknown metric keys remain unpublished', () => {
  assert.equal(comparisonVerifiedMetric(job(workplace({verified_metric_count: 0})), 'workplace', workplaceKey), null);
  assert.equal(comparisonVerifiedMetric(job(workplace({}, {value: null})), 'workplace', workplaceKey), null);
  assert.equal(comparisonVerifiedMetric(job(workplace({}, {value: ''})), 'workplace', workplaceKey), null);
  assert.equal(comparisonVerifiedMetric(job(workplace({}, {value: NaN})), 'workplace', workplaceKey), null);
  assert.equal(comparisonVerifiedMetric(job(workplace()), 'workplace', 'some_private_metric'), null);
  assert.equal(comparisonVerifiedMetric(job(null, null), 'finance', financeKey), null);
});
test('verified provenance is not interchangeable between workplace and finance', () => {
  assert.equal(comparisonVerifiedMetric(job(workplace({}, {source:'facility_declared'})), 'workplace', workplaceKey), null);
  assert.equal(comparisonVerifiedMetric(job(null, finance({}, {source:'ho_verified'})), 'finance', financeKey), null);
  assert.equal(comparisonVerifiedMetric(job(null, workplace()), 'finance', workplaceKey), null);
});
test('no record count is invented, invalid counts are not published', () => {
  assert.deepEqual(comparisonVerifiedMetric(job(workplace({}, {sample_size:null})), 'workplace', workplaceKey), {
    label: '平均時間外労働', displayValue:'3.5時間',
  });
  assert.deepEqual(comparisonVerifiedMetric(job(workplace({}, {sample_size:-1})), 'workplace', workplaceKey), {
    label: '平均時間外労働', displayValue:'3.5時間',
  });
});
