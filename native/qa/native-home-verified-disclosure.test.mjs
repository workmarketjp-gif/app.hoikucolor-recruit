import test from 'node:test';
import assert from 'node:assert/strict';
import { homeVerifiedDisclosure } from '../src/lib/homeVerifiedDisclosure.ts';

const verified = {
  verified_metric_count: 2,
  transparency_pct: 65.7,
  period_start: '2026-01-01',
  period_end: '2026-09-30',
};
const metrics = [{ key: 'average_tenure_years' }];

test('actual verified workplace records disclose source, coverage and period, never fictitious values', () => {
  assert.deepEqual(homeVerifiedDisclosure(verified, 'workplace', metrics), {
    label: '✓ 勤務実績あり',
    transparency: '情報公開率 66%',
    period: '集計期間 2026年1月〜2026年9月',
    attribution: '園の申告ではなく実際の勤務記録から集計',
    stabilityCaution: null,
  });
});

test('a verified count without visible values is not a trust badge', () => {
  assert.equal(homeVerifiedDisclosure(verified, 'workplace', []), null);
  assert.equal(homeVerifiedDisclosure({ ...verified, verified_metric_count: 0 }, 'workplace', metrics), null);
  assert.equal(homeVerifiedDisclosure({ ...verified, verified_metric_count: NaN }, 'finance', metrics), null);
  assert.equal(homeVerifiedDisclosure(null, 'finance', metrics), null);
});

test('unreliable transparency and dates are omitted instead of showing 0% or a malformed period', () => {
  for (const pct of [-1, 105, NaN, Infinity, undefined]) {
    assert.equal(homeVerifiedDisclosure({ ...verified, transparency_pct: pct }, 'workplace', metrics)?.transparency, null);
  }
  for (const bad of ['2026-02-30', '2026-13-01', 'unknown', '', undefined]) {
    assert.equal(homeVerifiedDisclosure({ ...verified, period_end: bad }, 'finance', metrics)?.period, null);
  }
  assert.equal(homeVerifiedDisclosure({ ...verified, period_start: '2026-10-01' }, 'finance', metrics)?.period, null);
});

test('finance origin and stability caution are only disclosed for an actual displayed finance measure', () => {
  const finance = homeVerifiedDisclosure(verified, 'finance', [{ key: 'finance_monthly_result_stability' }]);
  assert.equal(finance?.label, '✓ 会計実績あり');
  assert.match(finance?.attribution ?? '', /確定した会計記録/);
  assert.match(finance?.stabilityCaution ?? '', /保証するものではありません/);
  assert.equal(homeVerifiedDisclosure(verified, 'finance', [{ key: 'finance_closed_months_12m' }])?.stabilityCaution, null);
});
