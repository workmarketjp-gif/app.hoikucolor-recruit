import test from 'node:test';
import assert from 'node:assert/strict';
import { canCommitSavedJobsView, updateSavedJobAndConfirm, removeSavedJobAndConfirm } from '../src/lib/savedJobsReadback.ts';
import { reconcileComparedSelection, requestedComparisonJobIds } from '../src/lib/comparisonSelection.ts';

const A = '123e4567-e89b-42d3-a456-426614174000';
const B = '123e4567-e89b-42d3-a456-426614174001';
const CLOSED = '123e4567-e89b-42d3-a456-426614174002';

test('synthetic canonical save, refresh, compare selection, and unsave roundtrip', async () => {
  let saved = [B];
  const events = [];
  const added = await updateSavedJobAndConfirm(A, true, async () => {
    events.push('save-rpc');
    saved = [...saved, A];
  }, async () => {
    events.push('saved-id-readback');
    return [...saved];
  });
  assert.deepEqual(events, ['save-rpc', 'saved-id-readback']);
  assert.deepEqual(added, [B, A]);
  assert.deepEqual(reconcileComparedSelection(
    requestedComparisonJobIds(added), [A, B, CLOSED], 3,
  ), [B, A]);

  const removed = await updateSavedJobAndConfirm(A, false, async () => {
    saved = saved.filter((id) => id !== A);
  }, async () => [...saved]);
  assert.deepEqual(removed, [B]);
  assert.deepEqual(reconcileComparedSelection(requestedComparisonJobIds(removed), [A, B], 3), [B]);
});

test('already-removed and stale RPC confirmations never fabricate save state', async () => {
  await assert.rejects(
    updateSavedJobAndConfirm(A, true, async () => {}, async () => [B]),
    /保存状況を確認できませんでした/,
  );
  await assert.rejects(
    updateSavedJobAndConfirm(A, false, async () => {}, async () => [A]),
    /保存状況を確認できませんでした/,
  );
});

test('saved-row removal is acknowledged only after full canonical row re-read', async () => {
  const actual = await removeSavedJobAndConfirm(A, async () => {}, async () => [{ id: B }]);
  assert.deepEqual(actual, [{ id: B }]);
  await assert.rejects(
    removeSavedJobAndConfirm(A, async () => {}, async () => [{ id: A }]),
    /保存結果を確認できませんでした/,
  );
});

test('candidate/session generation and app lock stop old favorite rows from committing', () => {
  const owner = '["synthetic-user","synthetic-session-1"]';
  assert.equal(canCommitSavedJobsView(owner, owner, 4, 4, true), true);
  assert.equal(canCommitSavedJobsView(owner, '["synthetic-user","synthetic-session-2"]', 4, 4, true), false);
  assert.equal(canCommitSavedJobsView(owner, owner, 4, 5, true), false);
  assert.equal(canCommitSavedJobsView(owner, owner, 4, 4, false), false);
});

test('closed/revoked jobs are never injected by comparison deeplinks', () => {
  const requested = requestedComparisonJobIds([A, CLOSED, A, '../../profile']);
  assert.deepEqual(requested, [A, CLOSED]);
  assert.deepEqual(reconcileComparedSelection(requested, [A, B], 3), [A]);
});
