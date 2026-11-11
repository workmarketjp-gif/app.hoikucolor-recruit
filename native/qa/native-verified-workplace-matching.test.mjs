import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedWorkplaceNumericMetric } from '../src/lib/jobVerifiedEvidence.ts';

const metric = (value, patch = {}) => ({ label: '平均残業時間', value, source: 'ho_verified', sample_size: 12, unit: '時間', ...patch });
const profile = (item, patch = {}) => ({ verified_metric_count: 1, verified_metrics: { average_monthly_overtime_hours: item }, ...patch });
const read = (item, patch = {}) => verifiedWorkplaceNumericMetric(profile(item, patch), 'average_monthly_overtime_hours');

test('canonical verified numeric values retain raw precision across matching threshold', () => {
  assert.equal(read(metric(5)), 5);
  assert.equal(read(metric(5.04)), 5.04);
  assert.equal(read(metric(0)), 0);
  assert.equal(read(metric(' 4.75 ')), 4.75);
  assert.equal(read(metric('-0.5')), -0.5);
});

test('unverified and incorrectly sourced values never count as matching proof', () => {
  assert.equal(read(metric(2, { source: 'declared' })), null);
  assert.equal(read(metric(2, { source: 'hf_verified' })), null);
  assert.equal(read(metric(2), { verified_metric_count: 0 }), null);
  assert.equal(read(metric(2), { verified_metric_count: 0.5 }), null);
  assert.equal(read(metric(2), { verified_metrics: {} }), null);
  assert.equal(read(metric(2, { label: '' })), null);
  assert.equal(verifiedWorkplaceNumericMetric(null, 'average_monthly_overtime_hours'), null);
});

test('unknown metric keys, invalid numbers and decorated/infinite values are not evidence', () => {
  assert.equal(verifiedWorkplaceNumericMetric(profile(metric(2)), 'unknown_metric'), null);
  for (const bad of ['5時間', 'Infinity', 'NaN', '1e999', '', ' ', '5,000', '--1', Number.NaN, Infinity, null]) {
    assert.equal(read(metric(bad)), null, String(bad));
  }
});

test('all five canonical work preference metrics remain eligible', () => {
  for (const key of [
    'average_monthly_overtime_hours',
    'paid_leave_usage_rate_pct',
    'average_monthly_saturday_shift_count',
    'average_monthly_early_shift_count',
    'average_monthly_late_shift_count',
  ]) {
    assert.equal(verifiedWorkplaceNumericMetric({ verified_metric_count: 1, verified_metrics: { [key]: metric('4.1') } }, key), 4.1);
  }
});
