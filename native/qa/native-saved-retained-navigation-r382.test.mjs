import test from 'node:test';
import assert from 'node:assert/strict';
import { canActOnSavedJobs, canNavigateVerifiedSavedJob, retainSavedJobsDuringManualRefresh } from '../src/lib/savedJobsRefreshPolicy.ts';

const candidate = '["candidate-a","session-a"]';
const valid = { ownerKey: candidate, verifiedOwnerKey: candidate, hasVerifiedRows: true,
  privateAllowed: true, focusActive: true, mutationPending: false,
  navigationPending: false };

test('Web parity: verified saved cards can open and compare during same-session manual refresh', () => {
  assert.equal(retainSavedJobsDuringManualRefresh({manual:true, ownerKey:candidate, verifiedOwnerKey:candidate,
    privateAllowed:true, focusActive:true, mutationPending:false}), true);
  assert.equal(canNavigateVerifiedSavedJob(valid), true);
  assert.equal(canActOnSavedJobs({hasVerifiedRows:true, loading:true, readFailed:false,
    privateAllowed:true, focusActive:true, mutationPending:false}), false);
});

test('Web parity: verified saved cards remain viewable after failed manual refresh without unsave', () => {
  assert.equal(canNavigateVerifiedSavedJob(valid), true);
  assert.equal(canActOnSavedJobs({hasVerifiedRows:true, loading:false, readFailed:true,
    privateAllowed:true, focusActive:true, mutationPending:false}), false);
});

test('first loading/error state and missing canonical rows cannot grant navigation', () => {
  assert.equal(canNavigateVerifiedSavedJob({...valid, hasVerifiedRows:false}), false);
  assert.equal(canNavigateVerifiedSavedJob({...valid, verifiedOwnerKey:null}), false);
});

test('candidate or Clerk session switch invalidates an old row lease', () => {
  assert.equal(canNavigateVerifiedSavedJob({...valid, ownerKey:'["candidate-b","session-b"]'}), false);
  assert.equal(canNavigateVerifiedSavedJob({...valid, ownerKey:'["candidate-a","session-b"]'}), false);
  assert.equal(canNavigateVerifiedSavedJob({...valid, ownerKey:null}), false);
});

test('App Lock, blur, server mutation and repeated navigation remain blocked', () => {
  for (const invalid of [{privateAllowed:false},{focusActive:false},{mutationPending:true},{navigationPending:true}]) {
    assert.equal(canNavigateVerifiedSavedJob({...valid,...invalid}),false);
  }
});
