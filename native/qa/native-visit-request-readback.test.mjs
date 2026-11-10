import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmsRequestedVisit } from '../src/lib/visitRequestReadback.ts';

const expected = {
  reservationId: '11111111-1111-4111-8111-111111111111',
  jobId: '22222222-2222-4222-8222-222222222222',
  applicationId: null,
  experienceType: 'visit', localDate: '2026-11-12', localTime: '09:30',
  candidateMessage: '見学を希望します',
};
const row = {
  reservation_id: expected.reservationId, job_id: expected.jobId,
  application_id: null, experience_type: 'visit',
  starts_at: '2026-11-12T00:30:00+00:00',
  status: 'requested', candidate_message: '見学を希望します',
};
const match = (patch = {}, overrides = {}) =>
  confirmsRequestedVisit([{ ...row, ...patch }], { ...expected, ...overrides });

test('accepts the exact authorized reservation including Tokyo calendar time', () => {
  assert.equal(match(), true);
  assert.equal(match({ starts_at: '2026-11-12T09:30:00+09:00', status: 'confirmed' }), true);
  assert.equal(match({ starts_at: '2026-11-11T23:30:00Z' }, { localDate: '2026-11-12', localTime: '08:30' }), true);
});

test('same reservation ID is insufficient without job, application and experience match', () => {
  for (const patch of [
    { job_id: '33333333-3333-4333-8333-333333333333' },
    { application_id: '44444444-4444-4444-8444-444444444444' },
    { experience_type: 'full_day_trial' },
    { candidate_message: '異なる内容' },
    { status: 'cancelled' }, { status: 'declined' },
  ]) assert.equal(match(patch), false, JSON.stringify(patch));
  assert.equal(match({ application_id: '44444444-4444-4444-8444-444444444444' },
    { applicationId: '44444444-4444-4444-8444-444444444444' }), true);
});

test('fails closed on shifted calendar days, stale hours, and timezone-free timestamps', () => {
  for (const timestamp of [
    '2026-11-12T00:00:00Z', '2026-11-11T00:30:00Z',
    '2026-11-12T00:30:00', 'not-a-date', '',
  ]) assert.equal(match({ starts_at: timestamp }), false, timestamp);
  assert.equal(match({}, { localDate: '2026-11-13' }), false);
  assert.equal(match({}, { localTime: '10:30' }), false);
});

test('no row, wrong reservation, or duplicate rows never clears an outstanding mutation', () => {
  assert.equal(confirmsRequestedVisit([], expected), false);
  assert.equal(confirmsRequestedVisit([{ ...row, reservation_id: 'different' }], expected), false);
  assert.equal(confirmsRequestedVisit([row, row], expected), false);
});

test('null optional message is accepted only when both requested and saved states are null', () => {
  assert.equal(match({ candidate_message: null }, { candidateMessage: null }), true);
  assert.equal(match({ candidate_message: null }), false);
});
