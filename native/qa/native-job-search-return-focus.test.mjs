import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRefreshJobsOnReturn } from '../src/lib/jobSearchFocus.ts';

test('first tab mount is handled by the existing session bootstrap, without a duplicate RPC', () => {
  assert.equal(shouldRefreshJobsOnReturn({ ownerKey: null, hasBlurred: false }, 'userA:session1', true), false);
});
test('returning from job details for the same owner requires a canonical search and saved-state refresh', () => {
  assert.equal(shouldRefreshJobsOnReturn({ ownerKey: 'userA:session1', hasBlurred: true }, 'userA:session1', true), true);
});
test('same-owner rerender without navigation blur does not start extra server reads', () => {
  assert.equal(shouldRefreshJobsOnReturn({ ownerKey: 'userA:session1', hasBlurred: false }, 'userA:session1', true), false);
});
test('account or Clerk session switch is not a same-owner return', () => {
  assert.equal(shouldRefreshJobsOnReturn({ ownerKey: 'userA:session1', hasBlurred: true }, 'userB:session2', true), false);
  assert.equal(shouldRefreshJobsOnReturn({ ownerKey: 'userA:session1', hasBlurred: true }, 'userA:session2', true), false);
});
test('App Lock and unavailable private data cannot trigger the re-read', () => {
  assert.equal(shouldRefreshJobsOnReturn({ ownerKey: 'userA:session1', hasBlurred: true }, 'userA:session1', false), false);
});
test('missing owner never reuses stale results', () => {
  assert.equal(shouldRefreshJobsOnReturn({ ownerKey: null, hasBlurred: true }, null, true), false);
});
