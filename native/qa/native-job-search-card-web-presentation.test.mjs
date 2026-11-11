import assert from 'node:assert/strict';
import test from 'node:test';
import { jobSearchCardPresentation as present } from '../src/lib/jobSearchCardPresentation.ts';

const job = {
  prefecture: '東京都', city: '品川区', employment_type: '正社員',
  closing_at: null, verified_workplace: null, verified_finance: null,
};

test('Web summary displays prefecture + city as one location before employment type', () => {
  assert.equal(present(job).location, '東京都 品川区 ・ 正社員');
});

test('missing location uses Web fallback and does not invent an address', () => {
  assert.equal(present({ ...job, prefecture: null, city: null, employment_type: null }).location,
    '勤務地は詳細をご確認ください');
});

test('evidence badges require source-consistent visible metrics rather than counts', () => {
  const workplace = {
    verified_metric_count: 1,
    verified_metrics: { average_tenure_years: { label: '平均勤続年数', value: 4.1, source: 'ho_verified' } },
  };
  const finance = {
    verified_metric_count: 1,
    verified_metrics: { finance_closed_months_12m: { label: '月次締め実績', value: 8, source: 'hf_verified' } },
  };
  assert.equal(present({ ...job, verified_workplace: workplace }).hasVerifiedWorkplace, true);
  assert.equal(present({ ...job, verified_finance: finance }).hasVerifiedFinance, true);
  assert.equal(present({ ...job, verified_workplace: { verified_metric_count: 1 } }).hasVerifiedWorkplace, false);
  assert.equal(present({ ...job, verified_finance: { verified_metric_count: 1 } }).hasVerifiedFinance, false);
  assert.equal(present({ ...job, verified_workplace: { verified_metric_count: 0, verified_metrics: workplace.verified_metrics } }).hasVerifiedWorkplace, false);
  assert.equal(present(job).hasVerifiedWorkplace, false);
});

test('wrong source, unsupported keys and missing metric values are not verified evidence', () => {
  for (const profile of [
    { verified_metric_count: 1, verified_metrics: { average_tenure_years: { label: '平均勤続年数', value: 4.1, source: 'hf_verified' } } },
    { verified_metric_count: 1, verified_metrics: { unknown: { label: '不明', value: 10, source: 'ho_verified' } } },
    { verified_metric_count: 1, verified_metrics: { average_tenure_years: { label: '平均勤続年数', value: null, source: 'ho_verified' } } },
  ]) assert.equal(present({ ...job, verified_workplace: profile }).hasVerifiedWorkplace, false);
});

test('explicitly closed job is marked closed even without closing date', () => {
  assert.equal(present({ ...job, is_open: false }, Date.parse('2026-11-11')).isClosed, true);
});

test('past deadline is closed; exact deadline remains open to avoid early disable', () => {
  const cutoff = '2026-11-11T15:00:00+09:00';
  const exact = Date.parse(cutoff);
  assert.equal(present({ ...job, closing_at: cutoff }, exact).isClosed, false);
  assert.equal(present({ ...job, closing_at: cutoff }, exact + 1).isClosed, true);
});

test('invalid deadline does not manufacture a closed status', () => {
  assert.equal(present({ ...job, closing_at: 'unknown' }).isClosed, false);
});
