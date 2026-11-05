import test from 'node:test';
import assert from 'node:assert/strict';
import { updateSavedJobAndConfirm } from '../src/lib/savedJobsReadback.ts';

test('saving waits for canonical confirmation', async () => {
  const events = [];
  const saved = await updateSavedJobAndConfirm('job-a', true, async () => {
    events.push('save');
  }, async () => {
    events.push('read');
    return ['job-a', 'job-b'];
  });
  assert.deepEqual(events, ['save', 'read']);
  assert.deepEqual(saved, ['job-a', 'job-b']);
});

test('unsaving waits for canonical confirmation', async () => {
  const ids = await updateSavedJobAndConfirm('job-a', false, async () => {}, async () => ['job-b']);
  assert.deepEqual(ids, ['job-b']);
});

test('a successful mutation response does not substitute for stale saved readback', async () => {
  await assert.rejects(
    () => updateSavedJobAndConfirm('job-a', true, async () => {}, async () => []),
    /保存状況を確認できませんでした/,
  );
  await assert.rejects(
    () => updateSavedJobAndConfirm('job-a', false, async () => {}, async () => ['job-a']),
    /保存状況を確認できませんでした/,
  );
});

test('a failed canonical mutation is not followed by readback or optimistic success', async () => {
  let reread = 0;
  await assert.rejects(
    () => updateSavedJobAndConfirm('job-a', true, async () => {
      throw new Error('RPC refused');
    }, async () => {
      reread += 1;
      return ['job-a'];
    }),
    /RPC refused/,
  );
  assert.equal(reread, 0);
});

test('unknown canonical state is rejected, not interpreted as an empty list', async () => {
  await assert.rejects(
    () => updateSavedJobAndConfirm('job-a', true, async () => {}, async () => {
      throw new Error('network');
    }),
    /network/,
  );
  await assert.rejects(
    () => updateSavedJobAndConfirm('job-a', false, async () => {}, async () => [null]),
    /保存状況を確認できませんでした/,
  );
});
