import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparisonVerifiedMetric } from '../src/lib/comparisonVerifiedEvidence.ts';
import { comparisonVerifiedCell } from '../src/lib/comparisonCellPresentation.ts';

const key = 'finance_closed_months_12m';
const metric = (sample_size, extra = {}) => ({
  label: '月次締め実績', value: 9, unit: 'か月', source: 'hf_verified', sample_size, ...extra,
});
const financeJob = (item, verified_metric_count = 1) => ({
  verified_workplace: null,
  verified_finance: {
    verified_metric_count, verified_metrics: { [key]: item },
    transparency_pct: null, period_start: null, period_end: null,
  },
});

test('finance sample_size is record count (件), never fabricated month duration', () => {
  const record = comparisonVerifiedMetric(financeJob(metric(12)), 'finance', key);
  assert.deepEqual(record, { label: '月次締め実績', displayValue: '9か月\n12件の記録から集計' });
  assert.deepEqual(comparisonVerifiedCell(record), {
    value: '9か月', caption: '12件の記録から集計', emphasized: false,
  });
});
test('zero verified records is shown as zero records, not months', () => {
  const record = comparisonVerifiedMetric(financeJob(metric(0)), 'finance', key);
  assert.equal(record?.displayValue, '9か月\n0件の記録から集計');
});
test('missing or malformed sample_size never invents a verified count', () => {
  for (const size of [null, undefined, -1, 1.2, '12', NaN]) {
    const record = comparisonVerifiedMetric(financeJob(metric(size)), 'finance', key);
    assert.equal(record?.displayValue, '9か月');
    assert.equal(comparisonVerifiedCell(record).caption, null);
  }
});
test('unverified or wrong-source finance data cannot be shown as verified', () => {
  assert.equal(comparisonVerifiedMetric(financeJob(metric(12), 0), 'finance', key), null);
  assert.equal(comparisonVerifiedMetric(financeJob(metric(12, { source: 'ho_verified' })), 'finance', key), null);
});
test('workplace verified count remains expressed as records', () => {
  const job = {
    verified_workplace: { verified_metric_count: 1, verified_metrics: {
      average_monthly_overtime_hours: {
        label: '平均時間外労働', value: 3.5, unit: '時間', sample_size: 14, source: 'ho_verified',
      },
    }, transparency_pct: null, period_start: null, period_end: null },
    verified_finance: null,
  };
  assert.equal(comparisonVerifiedMetric(job, 'workplace', 'average_monthly_overtime_hours')?.displayValue,
    '3.5時間\n14件の記録から集計');
});
