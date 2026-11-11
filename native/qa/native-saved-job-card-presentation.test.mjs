import assert from 'node:assert/strict';
import test from 'node:test';
import { presentSavedJobCard, savedEvidenceRecordLabel } from '../src/lib/savedJobCardPresentation.ts';
const base = {
  is_open: true, closing_at: null, is_external: false, can_apply_direct: true,
  salary_type: 'monthly', salary_min: 240000, salary_max: 290000, salary_note: null,
  prefecture: '東京都', city: '品川区', employment_type: '正社員',
  verified_workplace: null, verified_finance: null,
};
const now = Date.parse('2026-11-08T00:00:00Z');
const display = (override = {}) => presentSavedJobCard({ ...base, ...override }, now);
test('canonical salary, region and job type are shown without invented figures', () => {
  assert.deepEqual(display(), {
    salary: '月給 240,000〜290,000円', location: '東京都 品川区', employmentType: '正社員',
    closed: false, directApply: true, canVisit: true, hasWorkplaceEvidence: false, hasFinanceEvidence: false,
  });
});
test('declared salary note preserves original wording for direct jobs', () => {
  assert.equal(display({ salary_note: '経験に応じて決定' }).salary, '経験に応じて決定');
});
test('imported hourly job uses structural wage and disables direct apply and visit', () => {
  const row = display({ is_external: true, salary_type: 'hourly', salary_min: 1250, salary_max: 1250, salary_note: '1,250円〜1,250円' });
  assert.equal(row.salary, '時給 1,250円');
  assert.equal(row.directApply, false);
  assert.equal(row.canVisit, false);
});
test('annual pay and unknown pay are not misrepresented as monthly', () => {
  assert.equal(display({ salary_type: 'annual', salary_min: 3500000, salary_max: null }).salary, '年収 3,500,000円〜');
  assert.equal(display({ salary_min: null, salary_max: null }).salary, '給与は詳細をご確認ください');
});
test('closed, expired and direct-apply-disabled jobs keep history without active CTA', () => {
  assert.equal(display({ is_open: false }).closed, true);
  assert.equal(display({ is_open: false }).directApply, false);
  assert.equal(display({ is_open: false }).canVisit, false);
  assert.equal(display({ closing_at: '2026-11-07T23:59:59Z' }).directApply, false);
  assert.equal(display({ can_apply_direct: false }).directApply, false);
  assert.equal(display({ can_apply_direct: false }).canVisit, true);
});
test('missing region/contract never synthesizes labels', () => {
  assert.equal(display({ prefecture: null, city: null }).location, '勤務地は詳細をご確認ください');
  assert.equal(display({ employment_type: null }).employmentType, null);
});
test('verified tags require actual metric records and proper source, not just claimed count', () => {
  assert.equal(display({ verified_workplace: { verified_metric_count: 9, verified_metrics: {} } }).hasWorkplaceEvidence, false);
  const metric = { verified_metric_count: 1, verified_metrics: { average_tenure_years: { value: 4.1, label: '平均勤続', source: 'ho_verified', sample_size: 12 } } };
  assert.equal(display({ verified_workplace: metric }).hasWorkplaceEvidence, true);
  assert.equal(display({ verified_finance: metric }).hasFinanceEvidence, false);
  const finance = { verified_metric_count: 1, verified_metrics: { finance_closed_months_12m: { value: 8, label: '月次締め実績', source: 'hf_verified', sample_size: 8 } } };
  assert.equal(display({ verified_finance: finance }).hasFinanceEvidence, true);
  assert.equal(display({ verified_finance: { verified_metric_count: 1, verified_metrics: { finance_closed_months_12m: { value: null, label: '月次締め実績' } } } }).hasFinanceEvidence, false);
});

test('saved-card badges never advertise a metric that the detail panel cannot actually display', () => {
  const arbitrary = { verified_metric_count: 1, verified_metrics: {
    fabricated_metric: { value: 100, label: '架空の実績', source: 'ho_verified' },
  } };
  assert.equal(display({ verified_workplace: arbitrary }).hasWorkplaceEvidence, false);
  const incorrectlySourced = { verified_metric_count: 1, verified_metrics: {
    finance_closed_months_12m: { value: 8, label: '月次確定', source: 'ho_verified' },
  } };
  assert.equal(display({ verified_finance: incorrectlySourced }).hasFinanceEvidence, false);
  const malformed = { verified_metric_count: 0.5, verified_metrics: {
    average_tenure_years: { value: 3.4, label: '平均勤続', source: 'ho_verified' },
  } };
  assert.equal(display({ verified_workplace: malformed }).hasWorkplaceEvidence, false);
});

test('workplace evidence counts and finance monthly records use distinct, validated units', () => {
  assert.equal(savedEvidenceRecordLabel('workplace', 12), '12件の記録');
  assert.equal(savedEvidenceRecordLabel('finance', 8), '8か月分の記録');
  assert.equal(savedEvidenceRecordLabel('finance', 0), '0か月分の記録');
  assert.equal(savedEvidenceRecordLabel('finance', Number.NaN), null);
  assert.equal(savedEvidenceRecordLabel('workplace', -1), null);
});
