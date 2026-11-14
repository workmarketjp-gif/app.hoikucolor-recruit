import assert from 'node:assert/strict';
import { test } from 'node:test';
import { comparisonConditionCell, comparisonVerifiedCell } from '../src/lib/comparisonCellPresentation.ts';

test('Web compare: only validated 70+ match scores carry strong visual emphasis', () => {
  assert.deepEqual(comparisonConditionCell(70), { value: '70%', caption: null, emphasized: true });
  assert.deepEqual(comparisonConditionCell(69), { value: '69%', caption: null, emphasized: false });
  assert.deepEqual(comparisonConditionCell(100), { value: '100%', caption: null, emphasized: true });
});

test('unset or non-finite/out-of-range match scores never claim a percentage', () => {
  for (const invalid of [null, NaN, Infinity, -1, 101]) {
    assert.deepEqual(comparisonConditionCell(invalid), {
      value: '希望条件未設定', caption: null, emphasized: false,
    });
  }
});

test('verified workplace and finance evidence keep the original value, unit and sample count on separate lines', () => {
  assert.deepEqual(comparisonVerifiedCell({ displayValue: '3.5時間\n14件の記録から集計' }), {
    value: '3.5時間', caption: '14件の記録から集計', emphasized: false,
  });
  assert.deepEqual(comparisonVerifiedCell({ displayValue: '10か月\n10か月分の記録から集計' }), {
    value: '10か月', caption: '10か月分の記録から集計', emphasized: false,
  });
});

test('not disclosed evidence and no validated count remain unasserted', () => {
  assert.deepEqual(comparisonVerifiedCell(null), {
    value: '実績未公開', caption: null, emphasized: false,
  });
  assert.deepEqual(comparisonVerifiedCell({ displayValue: '3.5時間' }), {
    value: '3.5時間', caption: null, emphasized: false,
  });
});

test('untrusted newlines are not interpreted as a verified sample-count label', () => {
  assert.deepEqual(comparisonVerifiedCell({ displayValue: '値\n誤った件数' }), {
    value: '値\n誤った件数', caption: null, emphasized: false,
  });
});
