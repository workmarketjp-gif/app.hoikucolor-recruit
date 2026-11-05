import assert from 'node:assert/strict';
import test from 'node:test';
import { disclosedCareerSalary } from '../src/lib/careerSalaryDisclosure.ts';

const sensitiveYen = 235000;

test('saved salary stays hidden before an explicit 月給 choice', () => {
  assert.equal(disclosedCareerSalary(null, sensitiveYen), null);
});
test('choosing 月給 allows a valid personal salary to appear', () => {
  assert.equal(disclosedCareerSalary('monthly', sensitiveYen), sensitiveYen);
});
test('switching to 時給 hides the previously disclosed amount', () => {
  assert.equal(disclosedCareerSalary('hourly', sensitiveYen), null);
});
test('switching to not employed hides the previously disclosed amount', () => {
  assert.equal(disclosedCareerSalary('none', sensitiveYen), null);
});
test('unknown salaries are never presented as zero', () => {
  assert.equal(disclosedCareerSalary('monthly', null), null);
});
test('explicit zero salary is not confused with unknown', () => {
  assert.equal(disclosedCareerSalary('monthly', 0), 0);
});
test('unexpected non-finite and negative values remain hidden', () => {
  for (const number of [NaN, Infinity, -Infinity, -1]) assert.equal(disclosedCareerSalary('monthly', number), null);
});
