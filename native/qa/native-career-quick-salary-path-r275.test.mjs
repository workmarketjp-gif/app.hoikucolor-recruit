import assert from 'node:assert/strict';
import test from 'node:test';
import { careerQuickSalaryNeedsInput, initialCareerQuickPath } from '../src/lib/careerQuickSalaryPath.ts';

test('salary path asks for input only when the canonical quick salary line is missing', () => {
  assert.equal(careerQuickSalaryNeedsInput('salary', null), true);
  assert.equal(careerQuickSalaryNeedsInput('salary', 0), false);
  assert.equal(careerQuickSalaryNeedsInput('salary', 220_000), false);
});

test('a desired minimum salary allows salary exploration even when detail mode needs current salary', () => {
  // Example: Web quick keep-income can use the desired minimum while the
  // separate more-holidays detail scenario cannot run without current salary.
  const quickLineFromDesiredMinimum = 230_000;
  const unrelatedDetailedMoreHolidaysLine = null;
  assert.equal(unrelatedDetailedMoreHolidaysLine, null);
  assert.equal(careerQuickSalaryNeedsInput('salary', quickLineFromDesiredMinimum), false);
});

test('non-salary paths never display the salary-input prompt', () => {
  for (const path of ['holidays', 'values']) {
    assert.equal(careerQuickSalaryNeedsInput(path, null), false);
    assert.equal(careerQuickSalaryNeedsInput(path, 230_000), false);
  }
});

test('Web initial path is salary when current/desired salary supplies a quick line', () => {
  assert.equal(initialCareerQuickPath(null), 'holidays');
  assert.equal(initialCareerQuickPath(230_000), 'salary');
  assert.equal(initialCareerQuickPath(0), 'salary');
});
