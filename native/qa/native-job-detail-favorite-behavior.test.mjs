import test from 'node:test';
import assert from 'node:assert/strict';
import { canCommitSavedJobsView, updateSavedJobAndConfirm } from '../src/lib/savedJobsReadback.ts';

const OWNER = 'candidate-a:session-1';

test('a matching focused owner and generation may present a confirmed heart', () => {
  assert.equal(canCommitSavedJobsView(OWNER, OWNER, 2, 2, true), true);
  for (const args of [
    [OWNER, 'candidate-b:session-2', 2, 2, true],
    [OWNER, OWNER, 2, 3, true],
    [OWNER, OWNER, 2, 2, false],
    [null, OWNER, 2, 2, true],
  ]) assert.equal(canCommitSavedJobsView(...args), false);
});

test('saving from job detail presents the heart only after canonical readback', async () => {
  const events = [];
  const ids = await updateSavedJobAndConfirm('job-1', true,
    async () => { events.push('mutation'); },
    async () => { events.push('readback'); return ['job-1']; });
  assert.deepEqual(events, ['mutation', 'readback']);
  assert.deepEqual(ids, ['job-1']);
});

test('removing a saved heart requires a canonical absence confirmation', async () => {
  const result = await updateSavedJobAndConfirm('job-1', false,
    async () => {}, async () => ['job-2']);
  assert.deepEqual(result, ['job-2']);
  await assert.rejects(updateSavedJobAndConfirm('job-1', false,
    async () => {}, async () => ['job-1']), /保存状況を確認できませんでした/);
});

test('stale and malformed canonical saved-ID readbacks never count as success', async () => {
  await assert.rejects(updateSavedJobAndConfirm('job-1', true,
    async () => {}, async () => []), /保存状況を確認できませんでした/);
  await assert.rejects(updateSavedJobAndConfirm('job-1', true,
    async () => {}, async () => [null]), /保存状況を確認できませんでした/);
});

test('a rejected write does not perform a second read or allow a guessed heart', async () => {
  let reads = 0;
  await assert.rejects(updateSavedJobAndConfirm('job-1', true,
    async () => { throw Error('transport rejected'); },
    async () => { reads++; return ['job-1']; }), /transport rejected/);
  assert.equal(reads, 0);
});

test('an uncertain readback error must propagate rather than become an empty list', async () => {
  await assert.rejects(updateSavedJobAndConfirm('job-1', true,
    async () => {}, async () => { throw Error('connection dropped'); }), /connection dropped/);
});
