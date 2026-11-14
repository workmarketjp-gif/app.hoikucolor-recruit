import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeResumeBirthDate, normalizeResumePostalCodeInput, splitResumeBirthDate,
} from '../src/lib/resumeBasicFieldPolicy.ts';

const TODAY = '2026-11-15';
test('calendar-valid past and today dates match Web ISO input', () => {
  assert.equal(composeResumeBirthDate('2000', '2', '29', TODAY), '2000-02-29');
  assert.equal(composeResumeBirthDate('2026', '11', '15', TODAY), TODAY);
  assert.equal(composeResumeBirthDate('1899', '12', '31', TODAY), '1899-12-31');
});
test('never create impossible calendar dates or leap-day errors', () => {
  for (const parts of [['2001','2','29'],['2000','2','30'],['2024','13','01'],['2024','00','01'],['2024','4','31'],['2024','1','00']]) {
    assert.equal(composeResumeBirthDate(...parts, TODAY), null, parts.join('-'));
  }
});
test('future dates, partial dates and invalid UTC max never reach canonical save', () => {
  for (const parts of [['2026','11','16'],['2027','1','1'],['0000','1','1'],['1','1','1'],['2024','1',''],['2024','01','22x']]) {
    assert.equal(composeResumeBirthDate(...parts, TODAY), null);
  }
  assert.equal(composeResumeBirthDate('2001','1','1','bad'), null);
});
test('normalizes month and day and keeps known legacy values readable', () => {
  assert.deepEqual(splitResumeBirthDate('1981-07-09'), { year:'1981',month:'07',day:'09' });
  assert.deepEqual(splitResumeBirthDate(null), { year:'',month:'',day:'' });
  assert.equal(composeResumeBirthDate('1981','7','9',TODAY),'1981-07-09');
});
test('postal code strips letters and punctuation without more than Web max 8 chars', () => {
  assert.equal(normalizeResumePostalCodeInput('〒150-0001'), '150-0001');
  assert.equal(normalizeResumePostalCodeInput('１50１２x3456789'), '50345678');
  assert.equal(normalizeResumePostalCodeInput('foo'), null);
  assert.equal(normalizeResumePostalCodeInput(''), null);
});
