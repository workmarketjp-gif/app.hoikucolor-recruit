import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCandidateVisitHistoryReadback } from '../src/lib/candidateVisitHistoryReadback.ts';

const visit = {
  reservation_id: 'f220116a-5c31-42ad-aaf4-f6d44d68c999',
  job_id: '11c82317-5e1e-4b30-9cd5-0db3628f77e1',
  application_id: null,
  facility_name: '合成さくら保育園', job_title: '保育士',
  prefecture: '東京都', city: '文京区', address: null,
  experience_type: 'half_day_trial', starts_at: '2026-11-10T02:00:00Z',
  ends_at: '2026-11-10T04:00:00Z', status: 'requested',
  candidate_message: '見学を希望します', confirmed_at: null, cancelled_at: null,
  completed_at: null, created_at: '2026-11-07T01:10:00Z',
  updated_at: '2026-11-07T02:12:00Z',
};
const check = (rows) => assertCandidateVisitHistoryReadback(rows);
const rejects = (rows) => assert.throws(() => check(rows), /見学・体験の履歴/);

test('true SQL empty array is valid; null, missing and objects are not empty history', () => {
  assert.doesNotThrow(() => check([]));
  for (const bad of [null, undefined, false, '[]', {}, { visits: [] }]) rejects(bad);
});
test('valid Japanese visit, private candidate message and nullable location data are preserved', () => {
  const rows = [{ ...visit }];
  assert.doesNotThrow(() => check(rows));
  assert.equal(rows[0].facility_name, '合成さくら保育園');
  assert.equal(rows[0].candidate_message, '見学を希望します');
});
test('owned application link is optional; no fabricated link or status', () => {
  const rows = [{ ...visit, application_id: '6411d4af-86f0-4791-b710-43fdcda51c25' }];
  assert.doesNotThrow(() => check(rows));
  assert.equal(rows[0].application_id, '6411d4af-86f0-4791-b710-43fdcda51c25');
});
test('malformed IDs, names, status, missing columns or timestamps fail closed', () => {
  for (const patch of [
    { reservation_id: 'bad' }, { job_id: false }, { application_id: {} },
    { facility_name: null }, { job_title: undefined }, { status: ' ' },
    { created_at: null }, { updated_at: 'not a date' },
  ]) rejects([{ ...visit, ...patch }]);
});
test('unknown experience type and invalid temporal ranges cannot be rendered as confirmed visits', () => {
  for (const patch of [
    { experience_type: 'multi_day' }, { starts_at: 'not-a-date' },
    { ends_at: visit.starts_at }, { ends_at: '2026-11-09T02:00:00Z' },
  ]) rejects([{ ...visit, ...patch }]);
});
test('corrupt optional text and event timestamps fail rather than silently changing state', () => {
  for (const patch of [
    { address: {} }, { prefecture: 0 }, { candidate_message: [] },
    { confirmed_at: 'bad' }, { cancelled_at: false }, { completed_at: {} },
  ]) rejects([{ ...visit, ...patch }]);
});
test('duplicate reservation IDs, including alternative casing, reject the entire response', () => {
  rejects([visit, { ...visit }]);
  rejects([visit, { ...visit, reservation_id: visit.reservation_id.toUpperCase() }]);
});
test('partial arrays are not permitted to truncate visit history silently', () => {
  for (const bad of [null, {}, 'visit', []]) rejects([visit, bad]);
});
