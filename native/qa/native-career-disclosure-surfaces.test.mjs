import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { disclosedCareerSalary } from '../src/lib/careerSalaryDisclosure.ts';

const screen = readFileSync(fileURLToPath(new URL('../src/components/CareerExperience.tsx', import.meta.url)), 'utf8');

// Both Home and /career reuse this component. A salary disclosed in the
// SalaryCheck choice must not leak through the advanced market card on /career.
test('both market comparison cards honor the explicit salary choice', () => {
  const cards = [...screen.matchAll(/<MoneyMarket\b[^>]*>/g)].map(([source]) => source);
  assert.equal(cards.length, 2, 'Home and /career should each have a canonical salary comparison card');
  for (const card of cards) assert.match(card, /\bown=\{disclosedOwn\}/);
  assert.doesNotMatch(screen, /<MoneyMarket\b[^>]*\bown=\{own\}/);
});

test('before selecting 月給, neither comparison shows a saved private salary', () => {
  const savedPrivateSalary = 235000;
  assert.equal(disclosedCareerSalary(null, savedPrivateSalary), null);
  assert.equal(disclosedCareerSalary('hourly', savedPrivateSalary), null);
  assert.equal(disclosedCareerSalary('none', savedPrivateSalary), null);
});

test('the private salary may be compared after selecting 月給', () => {
  assert.equal(disclosedCareerSalary('monthly', 235000), 235000);
  assert.equal(disclosedCareerSalary('monthly', null), null);
});
