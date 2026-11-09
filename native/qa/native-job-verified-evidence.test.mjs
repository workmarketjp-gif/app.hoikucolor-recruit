import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedEvidence, jobIsClosed } from '../src/lib/jobVerifiedEvidence.ts';

const workplace = { verified_metric_count: 2, transparency_pct: 68.6, period_start: '2026-01-01', period_end: '2026-03-31', verified_metrics: {
  average_monthly_overtime_hours: { label: '月平均残業時間', value: 1.26, unit: '時間', sample_size: 12, source: 'ho_verified' },
  average_tenure_years: { label: '平均勤続年数', value: 0, unit: '年', sample_size: 10, source: 'ho_verified' },
  unauthorized_metric: { label: '偽の点数', value: 100, unit: '点', sample_size: 99 },
} };

test('workplace shows only server-sourced priority evidence, including a real zero', () => {
  const result = verifiedEvidence(workplace, 'workplace');
  assert.deepEqual(result?.metrics, [
    { key: 'average_monthly_overtime_hours', label: '月平均残業時間', value: '1.3時間', recordCount: 12 },
    { key: 'average_tenure_years', label: '平均勤続年数', value: '0年', recordCount: 10 },
  ]);
  assert.equal(result?.transparencyPercent, 69);
  assert.equal(result?.period, '2026年1月〜2026年3月');
});
test('a declared or absent metric is not labelled as verified evidence', () => {
  assert.equal(verifiedEvidence(null, 'workplace'), null);
  assert.equal(verifiedEvidence({ ...workplace, verified_metric_count: 0 }, 'workplace'), null);
  assert.equal(verifiedEvidence({ ...workplace, verified_metrics: { average_monthly_overtime_hours: { label: '残業', value: '12', source: 'declared' } } }, 'workplace'), null);
});
test('finance reads only its approved seven evidence keys, not workplace metrics', () => {
  const result = verifiedEvidence({ verified_metric_count: 2, verified_metrics: {
    average_tenure_years: { label: '勤続', value: 5 },
    finance_closed_months_12m: { label: '月次確定月数', value: 8, unit: 'か月', sample_size: 8, source: 'hf_verified' },
  } }, 'finance');
  assert.deepEqual(result?.metrics, [{ key: 'finance_closed_months_12m', label: '月次確定月数', value: '8か月', recordCount: 8 }]);
});
test('invalid values are omitted rather than using invented zero', () => {
  const result = verifiedEvidence({ verified_metric_count: 2, transparency_pct: 140, period_start: '2026-00', period_end: '2026-01', verified_metrics: {
    average_monthly_overtime_hours: { label: '残業', value: Number.NaN },
    average_tenure_years: { label: '勤続', value: 2, sample_size: -1 },
  } }, 'workplace');
  assert.equal(result?.metrics.length, 1);
  assert.equal(result?.metrics[0].recordCount, null);
  assert.equal(result?.transparencyPercent, null);
  assert.equal(result?.period, null);
});
test('finance stability is not mistaken for an employer credit guarantee', () => {
  const result = verifiedEvidence({verified_metric_count: 1, verified_metrics:{finance_monthly_result_stability:{label:'月次収支安定性',value:'安定',source:'hf_verified'}}},'finance');
  assert.equal(result?.metrics[0].label, '月次収支安定性');
  assert.equal(result?.metrics[0].recordCount, null);
});
test('job closing checks past, future and unknown timestamps', () => {
  const now = Date.parse('2026-11-06T00:00:00Z');
  assert.equal(jobIsClosed('2026-11-05T23:59:59Z',now),true);
  assert.equal(jobIsClosed('2026-11-06T00:00:00Z',now),false);
  assert.equal(jobIsClosed('2026-11-07T00:00:00Z',now),false);
  assert.equal(jobIsClosed('invalid',now),false);
  assert.equal(jobIsClosed(null,now),false);
});


test('unverified fractional totals cannot authenticate a verified metric', () => {
  assert.equal(verifiedEvidence({ ...workplace, verified_metric_count: 0.5 }, 'workplace'), null);
  assert.equal(verifiedEvidence({ ...workplace, verified_metric_count: 1.5 }, 'workplace'), null);
});

test('impossible calendar dates cannot be asserted as an evidence period', () => {
  for (const invalid of ['2026-02-30', '2026-02-29', '2026-04-31', '2026-02-99']) {
    assert.equal(verifiedEvidence({ ...workplace, period_start: invalid }, 'workplace')?.period, null, invalid);
    assert.equal(verifiedEvidence({ ...workplace, period_end: invalid }, 'workplace')?.period, null, invalid);
  }
  assert.equal(verifiedEvidence({ ...workplace, period_start: '2024-02-29', period_end: '2024-03-31' }, 'workplace')?.period, '2024年2月〜2024年3月');
});

test('reversed or incomplete evidence periods are never shown as real coverage', () => {
  assert.equal(verifiedEvidence({ ...workplace, period_start: '2026-04-01', period_end: '2026-03-31' }, 'workplace')?.period, null);
  assert.equal(verifiedEvidence({ ...workplace, period_start: null, period_end: '2026-03-31' }, 'workplace')?.period, null);
});
