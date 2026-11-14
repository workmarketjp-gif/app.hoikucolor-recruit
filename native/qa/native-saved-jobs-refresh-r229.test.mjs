import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retainSavedJobsDuringManualRefresh, canStartSavedJobsRefresh, canActOnSavedJobs } from '../src/lib/savedJobsRefreshPolicy.ts';

const A = '["synthetic-candidate-a","synthetic-session-a"]';
const B = '["synthetic-candidate-b","synthetic-session-b"]';
const keep = (patch = {}) => ({ manual: true, ownerKey: A, verifiedOwnerKey: A,
  privateAllowed: true, focusActive: true, mutationPending: false, ...patch });
const start = (patch = {}) => ({ refreshPending: false, mutationPending: false,
  privateAllowed: true, focusActive: true, ownerKey: A, ...patch });
const act = (patch = {}) => ({ hasVerifiedRows: true, loading: false, readFailed: false,
  privateAllowed: true, focusActive: true, mutationPending: false, ...patch });

test('verified saved rows survive only an explicit same-session manual refresh', () => {
  assert.equal(retainSavedJobsDuringManualRefresh(keep()), true);
  for (const patch of [{ manual: false }, { ownerKey: B }, { verifiedOwnerKey: B },
    { verifiedOwnerKey: null }, { privateAllowed: false }, { focusActive: false },
    { mutationPending: true }, { ownerKey: null }]) {
    assert.equal(retainSavedJobsDuringManualRefresh(keep(patch)), false);
  }
});

test('rapid refresh taps never duplicate candidate reads', () => {
  assert.equal(canStartSavedJobsRefresh(start()), true);
  for (const patch of [{ refreshPending: true }, { mutationPending: true },
    { privateAllowed: false }, { focusActive: false }, { ownerKey: null }]) {
    assert.equal(canStartSavedJobsRefresh(start(patch)), false);
  }
});

test('stale and failed saved reads cannot enable open/compare/remove', () => {
  assert.equal(canActOnSavedJobs(act()), true);
  for (const patch of [{ hasVerifiedRows: false }, { loading: true }, { readFailed: true },
    { privateAllowed: false }, { focusActive: false }, { mutationPending: true }]) {
    assert.equal(canActOnSavedJobs(act(patch)), false);
  }
});
