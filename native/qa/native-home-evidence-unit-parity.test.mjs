import test from 'node:test';
import assert from 'node:assert/strict';
import { homeEvidenceMetrics } from '../src/lib/homeFeaturedDetails.ts';

const workplace = {
  verified_metric_count: 3,
  verified_metrics: {
    average_tenure_years: { label: '平均勤続年数', value: 4, unit: '年', sample_size: 5, source: 'ho_verified' },
    average_monthly_overtime_hours: { label: '月平均残業時間', value: 1.24, unit: '時間', sample_size: 12, source: 'ho_verified' },
    average_age_years: { label: '平均年齢', value: 34, unit: '歳', sample_size: 9, source: 'declared' },
  },
};

test('Home workplace evidence retains Web priority and does not promote declared values to verified', () => {
  assert.deepEqual(homeEvidenceMetrics(workplace, 'workplace'), [
    { key: 'average_monthly_overtime_hours', label: '月平均残業時間', displayValue: '1.2時間', sample: '12件の記録' },
    { key: 'average_tenure_years', label: '平均勤続年数', displayValue: '4年', sample: '5件の記録' },
  ]);
});

test('Home finance follows the exact Web priority, finance-only allowlist, and calendar-month sample units', () => {
  const finance = {
    verified_metric_count: 3,
    verified_metrics: {
      finance_closed_months_12m: { label: '月次確定月数', value: 11, unit: 'か月', sample_size: 11, source: 'hf_verified' },
      average_tenure_years: { label: '勤続年数', value: 20, unit: '年', sample_size: 99, source: 'ho_verified' },
      finance_monthly_result_stability: { label: '月次収支安定性', value: '安定', sample_size: 12, source: 'hf_verified' },
      extra_finance_metric: { label: '推定指標', value: 99, sample_size: 12, source: 'hf_verified' },
    },
  };
  assert.deepEqual(homeEvidenceMetrics(finance, 'finance'), [
    { key: 'finance_monthly_result_stability', label: '月次収支安定性', displayValue: '安定', sample: '12か月分の記録' },
    { key: 'finance_closed_months_12m', label: '月次確定月数', displayValue: '11か月', sample: '11か月分の記録' },
  ]);
});

test('wrong-source finance or workplace values never acquire a verified badge', () => {
  assert.deepEqual(homeEvidenceMetrics({ verified_metric_count: 1, verified_metrics: {
    finance_closed_months_12m: { label: '確定月数', value: 12, source: 'declared' },
  } }, 'finance'), []);
  assert.deepEqual(homeEvidenceMetrics({ verified_metric_count: 1, verified_metrics: {
    average_tenure_years: { label: '勤続年数', value: 10, source: 'hf_verified' },
  } }, 'workplace'), []);
});

test('genuine zero is displayed while missing/invalid samples are not fabricated', () => {
  assert.deepEqual(homeEvidenceMetrics({ verified_metric_count: 2, verified_metrics: {
    finance_monthly_result_stability: { label: '月次安定性', value: 0, sample_size: 0, source: 'hf_verified' },
    finance_closed_months_12m: { label: '月次確定', value: 3, sample_size: -1, source: 'hf_verified' },
  } }, 'finance'), [
    { key: 'finance_monthly_result_stability', label: '月次安定性', displayValue: '0', sample: '0か月分の記録' },
    { key: 'finance_closed_months_12m', label: '月次確定', displayValue: '3', sample: null },
  ]);
});

test('empty counts, malformed values and unapproved fields do not become verified metrics', () => {
  assert.deepEqual(homeEvidenceMetrics({ verified_metric_count: 0, verified_metrics: workplace.verified_metrics }, 'workplace'), []);
  assert.deepEqual(homeEvidenceMetrics({ verified_metric_count: 2, verified_metrics: {
    finance_positive_month_ratio_pct: { label: '良好月率', value: Infinity, source: 'hf_verified' },
    finance_average_result_margin_pct: { label: '利益率', value: ' ', source: 'hf_verified' },
    unknown: { label: '未審査', value: 1 },
  } }, 'finance'), []);
});

test('legacy verified RPC rows without per-metric provenance remain supported', () => {
  assert.deepEqual(homeEvidenceMetrics({ verified_metric_count: 1, verified_metrics: {
    finance_closed_months_12m: { label: '月次確定月数', value: 9, unit: 'か月', sample_size: 9 },
  } }, 'finance'), [
    { key: 'finance_closed_months_12m', label: '月次確定月数', displayValue: '9か月', sample: '9か月分の記録' },
  ]);
});
