import assert from 'node:assert/strict';
import { test } from 'node:test';
import { candidateMayCancelVisit, confirmsCandidateVisitCancellation } from '../src/lib/visitCancellationReadback.ts';

const before = {
  reservation_id: 'f220116a-5c31-42ad-aaf4-f6d44d68c999',
  job_id: '11c82317-5e1e-4b30-9cd5-0db3628f77e1',
  application_id: null,
  experience_type: 'half_day_trial',
  starts_at: '2026-11-15T01:00:00+00:00',
  ends_at: '2026-11-15T05:00:00+00:00',
  candidate_message: '持ち物について教えてください',
  created_at: '2026-11-10T01:00:00+00:00',
  updated_at: '2026-11-10T01:00:00+00:00',
  status: 'confirmed',
  cancelled_at: null,
};
const cancelled = {
  ...before,
  status: 'cancelled',
  cancelled_at: '2026-11-11T00:01:00+00:00',
  updated_at: '2026-11-11T00:01:00+00:00',
};
const id = before.reservation_id;

test('canonical active candidate booking may be cancelled exactly once', () => {
  assert.equal(candidateMayCancelVisit([before], id), true);
  assert.equal(confirmsCandidateVisitCancellation([before], [cancelled], id), true);
  assert.equal(confirmsCandidateVisitCancellation([{ ...before, status: 'requested' }], [cancelled], id), true);
});

test('stale, cancelled, declined or missing pre-RPC booking is not cancellable', () => {
  assert.equal(candidateMayCancelVisit([], id), false);
  for (const status of ['cancelled', 'declined', 'completed', 'no_show']) {
    assert.equal(candidateMayCancelVisit([{ ...before, status }], id), false);
    assert.equal(confirmsCandidateVisitCancellation([{ ...before, status }], [cancelled], id), false);
  }
  assert.equal(candidateMayCancelVisit([before, before], id), false);
  assert.equal(candidateMayCancelVisit([{ ...before, cancelled_at: cancelled.cancelled_at }], id), false);
});

test('RPC success is not enough: row must be cancelled with cancellation timestamp', () => {
  for (const patch of [
    { status: 'confirmed' }, { status: 'declined' }, { cancelled_at: null },
    { cancelled_at: 'not-a-date' }, { cancelled_at: '2026-11-11T00:01:00' },
    { cancelled_at: '2026-11-09T00:00:00Z' }, { updated_at: '2026-11-11T00:01:00' },
    { updated_at: before.updated_at },
  ]) assert.equal(confirmsCandidateVisitCancellation([before], [{ ...cancelled, ...patch }], id), false);
});

test('post-RPC readback cannot silently reassign the cancelled job, application or message', () => {
  const patches = [
    { job_id: '22222222-2222-4222-8222-222222222222' },
    { application_id: '22222222-2222-4222-8222-222222222222' },
    { experience_type: 'visit' },
    { starts_at: '2026-11-16T01:00:00Z' },
    { ends_at: '2026-11-16T05:00:00Z' },
    { candidate_message: '違う内容' },
    { created_at: '2026-11-12T00:00:00Z' },
  ];
  for (const patch of patches) {
    assert.equal(confirmsCandidateVisitCancellation([before], [{ ...cancelled, ...patch }], id), false, JSON.stringify(patch));
  }
});

test('absent/duplicate/other candidate history never proves cancellation', () => {
  assert.equal(confirmsCandidateVisitCancellation([before], [], id), false);
  assert.equal(confirmsCandidateVisitCancellation([before], [cancelled, cancelled], id), false);
  assert.equal(confirmsCandidateVisitCancellation([before, before], [cancelled], id), false);
  assert.equal(confirmsCandidateVisitCancellation([before], [{ ...cancelled, reservation_id: 'different' }], id), false);
});

test('UTC cancellation verification is device-timezone agnostic, including linked applications', () => {
  const linked = { ...before, application_id: '22222222-2222-4222-8222-222222222222' };
  const linkedCancelled = { ...cancelled, application_id: linked.application_id };
  assert.equal(confirmsCandidateVisitCancellation([linked], [linkedCancelled], id), true);
  assert.equal(confirmsCandidateVisitCancellation([linked], [cancelled], id), false);
});
