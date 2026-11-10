import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentJobVisitReservation,
  isSelectableVisitDateTime,
  isValidVisitCalendarDate,
  visitStartTimeSlots,
} from '../src/lib/visitBookingForm.ts';

test('Web slot window includes end when aligned and preserves 30-minute intervals', () => {
  assert.deepEqual(visitStartTimeSlots({ first_start_time: '09:00:00', last_start_time: '10:30:00', slot_interval_minutes: 30 }),
    ['09:00', '09:30', '10:00', '10:30']);
  assert.deepEqual(visitStartTimeSlots({ first_start_time: '09:00', last_start_time: '10:00', slot_interval_minutes: 40 }),
    ['09:00', '09:40']);
});

test('Web minimum slot step and default 30-minute fallback', () => {
  assert.deepEqual(visitStartTimeSlots({ first_start_time: '09:00', last_start_time: '09:30', slot_interval_minutes: 5 }),
    ['09:00', '09:15', '09:30']);
  assert.deepEqual(visitStartTimeSlots({ first_start_time: '09:00', last_start_time: '09:30', slot_interval_minutes: 0 }),
    ['09:00', '09:30']);
});

test('invalid venue windows never offer a phantom booking time', () => {
  const settings = { first_start_time: '17:00', last_start_time: '09:00', slot_interval_minutes: 30 };
  assert.deepEqual(visitStartTimeSlots(settings), []);
  assert.deepEqual(visitStartTimeSlots({ ...settings, first_start_time: 'wrong' }), []);
  assert.deepEqual(visitStartTimeSlots(null), []);
});

test('real Gregorian dates only, including leap day', () => {
  for (const value of ['2028-02-29', '2027-04-30', '2027-12-31']) assert.equal(isValidVisitCalendarDate(value), true);
  for (const value of ['2027-02-29', '2027-04-31', '2027-13-01', '2027-00-10', '2027-01-00', '2027-1-1', 'tomorrow', '', '0000-01-01']) {
    assert.equal(isValidVisitCalendarDate(value), false, value);
  }
});

test('only an advertised venue slot and valid date can enable submission', () => {
  assert.equal(isSelectableVisitDateTime('2027-01-04', '09:30', ['09:00', '09:30']), true);
  assert.equal(isSelectableVisitDateTime('2027-01-04', '09:45', ['09:00', '09:30']), false);
  assert.equal(isSelectableVisitDateTime('2027-02-30', '09:00', ['09:00']), false);
});

test('a pending/confirmed booking for the SAME job hides the new-booking form', () => {
  const visits = [
    { job_id: 'job-a', status: 'completed' },
    { job_id: 'job-b', status: 'confirmed' },
    { job_id: 'job-a', status: 'requested' },
  ];
  assert.equal(currentJobVisitReservation(visits, 'job-a'), visits[2]);
  assert.equal(currentJobVisitReservation(visits, 'job-b'), visits[1]);
  assert.equal(currentJobVisitReservation(visits, 'job-c'), null);
  assert.equal(currentJobVisitReservation(null, 'job-a'), null);
  assert.equal(currentJobVisitReservation(visits, null), null);
});
