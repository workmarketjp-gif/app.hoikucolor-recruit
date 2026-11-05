import test from 'node:test';
import assert from 'node:assert/strict';
import { canCommitSavedJobsView, removeSavedJobAndConfirm } from '../src/lib/savedJobsReadback.ts';

const A = '["synthetic-candidate-a","synthetic-session-a"]';
const B = '["synthetic-candidate-b","synthetic-session-b"]';

test('only matching live, unshielded candidate generation can commit', () => {
  assert.equal(canCommitSavedJobsView(A, A, 3, 3, true), true);
  assert.equal(canCommitSavedJobsView(A, B, 3, 3, true), false);
  assert.equal(canCommitSavedJobsView(A, A, 3, 4, true), false);
  assert.equal(canCommitSavedJobsView(A, A, 3, 3, false), false);
  assert.equal(canCommitSavedJobsView(null, null, 3, 3, true), false);
});

test('waits for canonical reread before returning authoritative rows', async () => {
  const events = [];
  const result = await removeSavedJobAndConfirm('job-1', async () => {
    events.push('mutate');
  }, async () => {
    events.push('readback');
    return [{ id: 'job-2' }];
  });
  assert.deepEqual(events, ['mutate', 'readback']);
  assert.deepEqual(result, [{ id: 'job-2' }]);
});

test('rejects stale canonical saved row without confirming removal', async () => {
  await assert.rejects(
    () => removeSavedJobAndConfirm('job-1', async () => {}, async () => [{ id: 'job-1' }]),
    /保存結果を確認できませんでした/,
  );
});

test('never treats a mutation failure as removed', async () => {
  let read = false;
  await assert.rejects(
    () => removeSavedJobAndConfirm('job-1', async () => { throw new Error('network'); }, async () => { read = true; return []; }),
    /network/,
  );
  assert.equal(read, false);
});

test('never confirms if canonical reread fails or yields malformed rows', async () => {
  await assert.rejects(
    () => removeSavedJobAndConfirm('job-1', async () => {}, async () => { throw new Error('offline'); }),
    /offline/,
  );
  await assert.rejects(
    () => removeSavedJobAndConfirm('job-1', async () => {}, async () => [null]),
    /保存結果を確認できませんでした/,
  );
});
