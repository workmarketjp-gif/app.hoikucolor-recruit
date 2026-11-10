import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelCandidateVisitWithLease } from '../src/lib/visitCancellationReadback.ts';

const id = 'f220116a-5c31-42ad-aaf4-f6d44d68c999';
const before = Object.freeze({
  reservation_id: id,
  job_id: '11c82317-5e1e-4b30-9cd5-0db3628f77e1',
  application_id: null,
  experience_type: 'visit',
  starts_at: '2026-11-15T01:00:00+00:00',
  ends_at: '2026-11-15T02:00:00+00:00',
  candidate_message: null,
  created_at: '2026-11-10T01:00:00+00:00',
  updated_at: '2026-11-10T01:00:00+00:00',
  status: 'requested',
  cancelled_at: null,
});
const after = Object.freeze({
  ...before,
  status: 'cancelled',
  cancelled_at: '2026-11-11T00:01:00+00:00',
  updated_at: '2026-11-11T00:01:00+00:00',
});
function harness(options = {}) {
  let current = true;
  let writes = 0;
  let reads = 0;
  const actions = {
    reservationId: id,
    isCurrent: () => current,
    readVisits: async () => {
      reads++;
      const result = reads === 1 ? [before] : [options.readback || after];
      if (options.onRead) await options.onRead(reads, () => { current = false; });
      return result;
    },
    invokeCancel: async () => {
      writes++;
      if (options.onWrite) await options.onWrite(() => { current = false; });
      return options.result ?? true;
    },
  };
  return { actions, revoke: () => { current = false; }, counts: () => ({ writes, reads }) };
}

test('one canonical cancellation RPC and verified re-read on current owner', async () => {
  const h = harness();
  await cancelCandidateVisitWithLease(h.actions);
  assert.deepEqual(h.counts(), { reads: 2, writes: 1 });
});

test('revoked before starting: no private read and no cancellation', async () => {
  const h = harness();
  h.revoke();
  await assert.rejects(cancelCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.counts(), { reads: 0, writes: 0 });
});

test('account switched while preflight history is in flight: no mutation', async () => {
  const h = harness({ onRead: async (n, revoke) => { if (n === 1) revoke(); } });
  await assert.rejects(cancelCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.counts(), { reads: 1, writes: 0 });
});

test('canonical history stale or absent: cannot issue cancellation', async () => {
  const h = harness({ onRead: null });
  h.actions.readVisits = async () => [{ ...before, status: 'declined' }];
  await assert.rejects(cancelCandidateVisitWithLease(h.actions), /最新状態が変わりました/);
  assert.equal(h.counts().writes, 0);
});

test('revoked during RPC: do not fetch post-write history or claim success', async () => {
  const h = harness({ onWrite: async (revoke) => revoke() });
  await assert.rejects(cancelCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.counts(), { reads: 1, writes: 1 });
});

test('revoked during post-write history: never mark success', async () => {
  const h = harness({ onRead: async (n, revoke) => { if (n === 2) revoke(); } });
  await assert.rejects(cancelCandidateVisitWithLease(h.actions), /認証状態が変更/);
  assert.deepEqual(h.counts(), { reads: 2, writes: 1 });
});

test('RPC failure/mismatched response: never retry cancellation', async () => {
  for (const opts of [{ result: false }, { readback: { ...after, job_id: '22222222-2222-4222-8222-222222222222' } }]) {
    const h = harness(opts);
    await assert.rejects(cancelCandidateVisitWithLease(h.actions), /再送信せず/);
    assert.equal(h.counts().writes, 1);
  }
});
