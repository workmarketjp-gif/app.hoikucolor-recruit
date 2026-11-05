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
  assert.equal(visitReadbackConfirmsMutation(rows, 'missing', 'cancel'), false);
  assert.equal(visitReadbackConfirmsMutation([{ reservation_id: 'visit-4', status: 'unknown' }], 'visit-4', 'cancel'), false);
});
// Web /visits status and timezone parity are separate from session guards.
import { visitStatusLabel, partitionVisitHistory, formatVisitDateTimeJapan } from '../src/lib/visitPresentation.ts';

test('Web visit statuses are localized exactly, and unknown statuses are not guessed', () => {
  assert.deepEqual(
    ['requested','confirmed','declined','cancelled','completed','no_show'].map(visitStatusLabel),
    ['日程調整中','確定','日程調整不可','キャンセル','完了','未参加'],
  );
  assert.equal(visitStatusLabel('future_server_status'), '状態を確認できません');
});

test('Web active appointments sort ascending and history descending without mutating canonical rows', () => {
  const input = [
    { reservation_id:'a', status:'confirmed', starts_at:'2027-01-02T02:00:00Z' },
    { reservation_id:'b', status:'requested', starts_at:'2027-01-01T02:00:00Z' },
    { reservation_id:'c', status:'completed', starts_at:'2026-12-01T02:00:00Z' },
    { reservation_id:'d', status:'declined', starts_at:'2026-12-02T02:00:00Z' },
  ];
  const original = [...input];
  const { active, history } = partitionVisitHistory(input, null);
  assert.deepEqual(active.map(v => v.reservation_id), ['b','a']);
  assert.deepEqual(history.map(v => v.reservation_id), ['d','c']);
  assert.deepEqual(input, original);
});

test('exact deep-linked visit promoted within its own section, not mixed with another', () => {
  const input = [
    { reservation_id:'a', status:'confirmed', starts_at:'2027-01-01T02:00:00Z' },
    { reservation_id:'b', status:'requested', starts_at:'2027-01-02T02:00:00Z' },
    { reservation_id:'c', status:'cancelled', starts_at:'2026-12-31T02:00:00Z' },
  ];
  assert.deepEqual(partitionVisitHistory(input,'b').active.map(v=>v.reservation_id), ['b','a']);
  assert.deepEqual(partitionVisitHistory(input,'c').history.map(v=>v.reservation_id), ['c']);
});

test('Japan appointment time is independent of device timezone, invalid dates fail closed', () => {
  const datetime = formatVisitDateTimeJapan('2027-01-02T00:30:00Z');
  assert.match(datetime, /2027/);
  assert.match(datetime, /9:30|09:30/);
  assert.equal(formatVisitDateTimeJapan('invalid'), '日時未設定');
  assert.equal(formatVisitDateTimeJapan(null), '日時未設定');
});
