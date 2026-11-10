import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  japanVisitToday,
  shiftVisitDay,
  shiftVisitCalendarMonth,
  visitCalendarCells,
  isSelectableVisitCalendarDay,
} from '../src/lib/visitBookingForm.ts';

const utc = (date) => Date.parse(date);

test('venue date uses JST around UTC/day boundaries, independently of device timezone', () => {
  assert.equal(japanVisitToday(utc('2026-11-10T14:59:59Z')), '2026-11-10');
  assert.equal(japanVisitToday(utc('2026-11-10T15:00:00Z')), '2026-11-11');
  assert.equal(japanVisitToday(utc('2026-12-31T15:00:00Z')), '2027-01-01');
});

test('calendar is Monday-first including month-end and leap year', () => {
  const feb2028 = visitCalendarCells('2028-02');
  assert.equal(feb2028.length % 7, 0);
  assert.deepEqual(feb2028.slice(0, 3), [null, '2028-02-01', '2028-02-02']);
  assert.ok(feb2028.includes('2028-02-29'));
  assert.equal(feb2028.includes('2028-02-30'), false);
  assert.equal(visitCalendarCells('0000-03').length, 0);
});

test('month changes across year boundaries without Date year 0-99 bugs', () => {
  assert.equal(shiftVisitCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftVisitCalendarMonth('2027-01', -1), '2026-12');
  assert.equal(shiftVisitCalendarMonth('0001-01', -1), null);
  assert.equal(shiftVisitCalendarMonth('9999-12', 1), null);
});

test('max-days window crosses month and leap boundaries inclusively', () => {
  const now = utc('2028-02-26T17:00:00Z'); // 2028-02-27 JST
  assert.equal(shiftVisitDay('2028-02-27', 3), '2028-03-01');
  assert.equal(isSelectableVisitCalendarDay('2028-02-29', now, 3, [1, 2, 3, 4, 5, 6, 7]), true);
  assert.equal(isSelectableVisitCalendarDay('2028-03-01', now, 3, [1, 2, 3, 4, 5, 6, 7]), true);
  assert.equal(isSelectableVisitCalendarDay('2028-03-02', now, 3, [1, 2, 3, 4, 5, 6, 7]), false);
  assert.equal(isSelectableVisitCalendarDay('2028-02-26', now, 3, [1, 2, 3, 4, 5, 6, 7]), false);
});

test('weekday numbers are ISO Monday=1 through Sunday=7', () => {
  const now = utc('2026-11-08T16:00:00Z'); // Monday 2026-11-09 JST
  assert.equal(isSelectableVisitCalendarDay('2026-11-09', now, 6, [1]), true);
  assert.equal(isSelectableVisitCalendarDay('2026-11-10', now, 6, [1]), false);
  assert.equal(isSelectableVisitCalendarDay('2026-11-15', now, 6, [7]), true);
  assert.equal(isSelectableVisitCalendarDay('2026-11-15', now, 6, []), false);
});

test('invalid dates, negative/unknown windows and invalid month do not enable selection', () => {
  const now = utc('2026-11-10T15:00:00Z');
  assert.equal(isSelectableVisitCalendarDay('2026-11-31', now, 90, [1, 2, 3, 4, 5, 6, 7]), false);
  assert.equal(isSelectableVisitCalendarDay('2026-11-11', now, -1, [3]), false);
  assert.equal(isSelectableVisitCalendarDay('2026-11-11', now, Number.NaN, [3]), false);
  assert.equal(visitCalendarCells('2026-00').length, 0);
});
