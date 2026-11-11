import assert from 'node:assert/strict';
import test from 'node:test';
import { profileWebValidationError } from '../src/lib/profileWebValidation.ts';

test('Web required name cannot be bypassed in Native before the profile RPC', () => {
  for (const name of [null, undefined, '', '  ', '\u3000']) {
    assert.equal(profileWebValidationError(name, null), 'お名前を入力してください。');
  }
});

test('valid name and optional desired start date remain editable', () => {
  for (const date of [null, undefined, '', ' ', '2026-11-11', '2028-02-29', '2000-02-29', '0004-02-29']) {
    assert.equal(profileWebValidationError('保育 花子', date), null);
  }
});

test('Web date-only control cannot send locale or timestamp strings', () => {
  for (const value of ['11/11/2026', '2026/11/11', '2026-1-01', '2026-01-1', '2026-01-01T00:00:00Z', ' 2026-01-01']) {
    assert.match(profileWebValidationError('花子', value), /勤務開始希望日/);
  }
});

test('calendar-invalid dates are rejected without network submission', () => {
  for (const value of ['0000-01-01', '2026-00-01', '2026-13-01', '2026-02-29', '1900-02-29', '2026-04-31', '2026-11-00', '2026-11-31']) {
    assert.match(profileWebValidationError('花子', value), /勤務開始希望日/);
  }
});

test('Gregorian leap years including century exception match date input semantics', () => {
  assert.equal(profileWebValidationError('花子', '2400-02-29'), null);
  assert.match(profileWebValidationError('花子', '2100-02-29'), /勤務開始希望日/);
});
