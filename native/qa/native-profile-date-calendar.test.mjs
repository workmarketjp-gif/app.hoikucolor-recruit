import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProfileCalendarDate, profileCalendarCells, profileCalendarInitialMonth,
  profileCalendarToday, shiftProfileCalendarMonth,
} from '../src/lib/profileDateCalendar.ts';

test('profile allows any valid historical and future date, without booking restrictions', () => {
  for (const value of ['0001-01-01', '1900-12-31', '2000-02-29', '2026-11-11', '2400-02-29', '9999-12-31']) {
    assert.equal(isProfileCalendarDate(value), true, value);
  }
  for (const value of [null, '', '2026-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '0000-01-01', '2026-11-11T00:00:00Z', '11/11/2026']) {
    assert.equal(isProfileCalendarDate(value), false, String(value));
  }
});

test('month/year changes include both directions but cannot leave 0001–9999', () => {
  assert.equal(shiftProfileCalendarMonth('2026-01', -1), '2025-12');
  assert.equal(shiftProfileCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftProfileCalendarMonth('2026-03', -12), '2025-03');
  assert.equal(shiftProfileCalendarMonth('2026-03', 12), '2027-03');
  assert.equal(shiftProfileCalendarMonth('0001-01', -1), null);
  assert.equal(shiftProfileCalendarMonth('0001-12', -12), null);
  assert.equal(shiftProfileCalendarMonth('9999-12', 1), null);
  assert.equal(shiftProfileCalendarMonth('9999-01', 12), null);
});

test('month grid includes only valid dates and Monday-first rows', () => {
  const febLeap = profileCalendarCells('2028-02').filter(Boolean);
  assert.equal(febLeap.length, 29);
  assert.equal(febLeap[0], '2028-02-01');
  assert.equal(febLeap.at(-1), '2028-02-29');
  assert.equal(profileCalendarCells('1900-02').filter(Boolean).length, 28);
  assert.equal(profileCalendarCells('2000-02').filter(Boolean).length, 29);
  assert.equal(profileCalendarCells('2026-04').filter(Boolean).length, 30);
  assert.equal(profileCalendarCells('2026-11').filter(Boolean).length, 30);
  assert.equal(profileCalendarCells('2026-11')[6], '2026-11-01'); // Sunday
  for (const month of ['0001-01', '2026-02', '2028-02', '9999-12']) {
    const cells = profileCalendarCells(month);
    assert.equal(cells.length % 7, 0);
    for (const cell of cells) if (cell !== null) assert.equal(isProfileCalendarDate(cell), true);
  }
});

test('existing date is displayed by month, invalid previous value is not silently normalized', () => {
  assert.equal(profileCalendarInitialMonth('2028-02-29', '2026-11-11'), '2028-02');
  assert.equal(profileCalendarInitialMonth('2026-02-29', '2026-11-11'), '2026-11');
  assert.equal(profileCalendarInitialMonth(null, '2026-11-11'), '2026-11');
});

test('local day is not shifted by UTC time zone serialization', () => {
  const d = new Date(2026, 10, 11, 0, 1, 0);
  assert.equal(profileCalendarToday(d), '2026-11-11');
});
