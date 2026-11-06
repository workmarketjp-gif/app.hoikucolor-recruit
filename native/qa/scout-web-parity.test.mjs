import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateScoutNumericInput, scoutStatusLabel, scoutResponseNote,
  formatScoutDateTime, scoutJobLine,
} from '../src/lib/scoutWebParity.ts';

const input = { monthlySalaryText: '250000', hourlyWageText: '1300', commuteText: '45', availableTimeFrom: '08:00', availableTimeTo: '17:00' };

test('valid scout preferences preserve canonical numeric values and null blanks', () => {
  assert.deepEqual(validateScoutNumericInput(input), { ok: true, values: {
    desired_monthly_salary_min: 250000, desired_hourly_wage_min: 1300, max_commute_minutes: 45,
  } });
  assert.deepEqual(validateScoutNumericInput({ ...input, monthlySalaryText: '', commuteText: '' }), {
    ok: true, values: { desired_monthly_salary_min: null, desired_hourly_wage_min: 1300, max_commute_minutes: null },
  });
});

test('unintended decimals, exponent values and unsafe integer wages never get submitted', () => {
  for (const value of ['1.5', '1e3', '-1', 'NaN', '9999999999999999999', '1,000']) {
    assert.equal(validateScoutNumericInput({ ...input, monthlySalaryText: value }).ok, false, value);
  }
});

test('commute matches Web 1–300 minutes and never treats 0 as valid', () => {
  for (const text of ['0', '301', '1.5', '-5', '1e2']) assert.equal(validateScoutNumericInput({ ...input, commuteText: text }).ok, false);
  for (const text of ['1', '300']) assert.equal(validateScoutNumericInput({ ...input, commuteText: text }).ok, true);
});

test('times match actual Web time control and ordering', () => {
  for (const value of ['8:00', '24:00', '23:60', 'abc']) {
    assert.equal(validateScoutNumericInput({ ...input, availableTimeFrom: value }).ok, false, value);
  }
  assert.equal(validateScoutNumericInput({ ...input, availableTimeFrom: '18:00', availableTimeTo: '18:00' }).ok, false);
  assert.equal(validateScoutNumericInput({ ...input, availableTimeFrom: '17:00', availableTimeTo: '08:00' }).ok, false);
  assert.equal(validateScoutNumericInput({ ...input, availableTimeFrom: null, availableTimeTo: null }).ok, true);
});

test('scout status translations match actual Web and disclose no false response', () => {
  assert.equal(scoutStatusLabel('cancelled'), '取り消し');
  assert.equal(scoutStatusLabel('expired'), '期限切れ');
  assert.equal(scoutResponseNote('pending'), null);
  assert.equal(scoutResponseNote('cancelled'), null);
  assert.match(scoutResponseNote('expired'), /本人情報は共有されません/);
});

test('job summaries have the exact Web missing-title fallback', () => {
  assert.equal(scoutJobLine(null, 'パート'), '募集職種 ・ パート');
  assert.equal(scoutJobLine('保育士', '常勤'), '保育士 ・ 常勤');
  assert.equal(scoutJobLine(null, null), '');
});

test('invalid dates are not shown as user-visible raw garbage', () => {
  assert.equal(formatScoutDateTime('invalid'), '');
  assert.equal(formatScoutDateTime(undefined), '');
  assert.ok(formatScoutDateTime('2026-11-06T05:00:00Z').length > 0);
});
