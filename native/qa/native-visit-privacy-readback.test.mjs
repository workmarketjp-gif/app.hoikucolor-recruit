import assert from 'node:assert/strict';
import test from 'node:test';
import { canRequestVisibleVisit, canCancelVisibleVisit, visitReadbackConfirmsMutation } from '../src/lib/visitPresentation.ts';

const ownerA = JSON.stringify(['candidateA', 'session1']);
const ownerB = JSON.stringify(['candidateB', 'session2']);
const rows = [
  { reservation_id: 'visit-1', status: 'requested' },
  { reservation_id: 'visit-2', status: 'confirmed' },
  { reservation_id: 'visit-3', status: 'cancelled' },
];

test('visit request requires a fresh matching presentation owner and offered type', () => {
  assert.equal(canRequestVisibleVisit(ownerA, ownerA, 'job-1', ['visit'], 'visit', '2027-01-02', '09:30'), true);
  assert.equal(canRequestVisibleVisit(ownerA, ownerB, 'job-1', ['visit'], 'visit', '2027-01-02', '09:30'), false);
  assert.equal(canRequestVisibleVisit(ownerA, null, 'job-1', ['visit'], 'visit', '2027-01-02', '09:30'), false);
  assert.equal(canRequestVisibleVisit(null, ownerA, 'job-1', ['visit'], 'visit', '2027-01-02', '09:30'), false);
});

test('visit request rejects missing form data and unavailable settings', () => {
  assert.equal(canRequestVisibleVisit(ownerA, ownerA, null, ['visit'], 'visit', '2027-01-02', '09:30'), false);
  assert.equal(canRequestVisibleVisit(ownerA, ownerA, 'job-1', [], 'visit', '2027-01-02', '09:30'), false);
  assert.equal(canRequestVisibleVisit(ownerA, ownerA, 'job-1', ['half_day_trial'], 'visit', '2027-01-02', '09:30'), false);
  assert.equal(canRequestVisibleVisit(ownerA, ownerA, 'job-1', ['visit'], 'visit', ' ', '09:30'), false);
  assert.equal(canRequestVisibleVisit(ownerA, ownerA, 'job-1', ['visit'], 'visit', '2027-01-02', '  '), false);
});

test('cancellation is restricted to visible, still-cancellable reservations', () => {
  assert.equal(canCancelVisibleVisit(ownerA, ownerA, rows, 'visit-1'), true);
  assert.equal(canCancelVisibleVisit(ownerA, ownerA, rows, 'visit-2'), true);
  assert.equal(canCancelVisibleVisit(ownerA, ownerA, rows, 'visit-3'), false);
  assert.equal(canCancelVisibleVisit(ownerA, ownerA, rows, 'foreign'), false);
  assert.equal(canCancelVisibleVisit(ownerA, null, rows, 'visit-1'), false);
  assert.equal(canCancelVisibleVisit(ownerB, ownerA, rows, 'visit-1'), false);
  assert.equal(canCancelVisibleVisit(ownerA, ownerA, null, 'visit-1'), false);
});

test('request is not confirmed until its exact reservation appears in canonical readback', () => {
  assert.equal(visitReadbackConfirmsMutation(rows, 'visit-1', 'request'), true);
  assert.equal(visitReadbackConfirmsMutation(rows, 'missing', 'request'), false);
});

test('cancel is not confirmed by stale requested or confirmed readback', () => {
  assert.equal(visitReadbackConfirmsMutation(rows, 'visit-1', 'cancel'), false);
  assert.equal(visitReadbackConfirmsMutation(rows, 'visit-2', 'cancel'), false);
  assert.equal(visitReadbackConfirmsMutation(rows, 'visit-3', 'cancel'), true);
  assert.equal(visitReadbackConfirmsMutation(rows, 'missing', 'cancel'), true);
});
