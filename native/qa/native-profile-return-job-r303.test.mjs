import assert from 'node:assert/strict';
import test from 'node:test';
import { specifiedJobIdFromRoute } from '../src/lib/jobSearchSpecifiedEntry.ts';
import { confirmedProfileReturnJobId } from '../src/lib/profileReturnJob.ts';

const id = 'a1a11111-1111-4111-8111-111111111111';
const other = 'b2b22222-2222-4222-8222-222222222222';
const state = {
  requestedJobId: id,
  currentJobId: id,
  saveOwnerKey: 'candidate:session1',
  currentOwnerKey: 'candidate:session1',
  canonicalConfirmed: true,
  unchangedDraft: true,
  sessionCurrent: true,
  privateAvailable: true,
};

test('Web return_job parses the same UUID contract as the search deep link', () => {
  assert.equal(specifiedJobIdFromRoute(id.toUpperCase()), id);
  assert.equal(specifiedJobIdFromRoute([id, other]), id);
  for (const hint of [undefined, '', '/jobs/else', '11111111-1111-1111-1111-111111111111'])
    assert.equal(specifiedJobIdFromRoute(hint), null);
});
test('verified same-session canonical profile save returns to the requested job, never auto-applies', () => {
  assert.equal(confirmedProfileReturnJobId(state), id);
  assert.equal(confirmedProfileReturnJobId({ ...state, requestedJobId: null }), null);
});
test('editing during the write retains the unsaved form and prevents navigation', () => {
  assert.equal(confirmedProfileReturnJobId({ ...state, unchangedDraft: false }), null);
});
test('ambiguous write or reread mismatch never returns to the job', () => {
  assert.equal(confirmedProfileReturnJobId({ ...state, canonicalConfirmed: false }), null);
});
test('account switch or token revocation blocks a delayed return', () => {
  assert.equal(confirmedProfileReturnJobId({ ...state, currentOwnerKey: 'another:session2' }), null);
  assert.equal(confirmedProfileReturnJobId({ ...state, currentOwnerKey: null }), null);
  assert.equal(confirmedProfileReturnJobId({ ...state, sessionCurrent: false }), null);
});
test('App Lock and route replacement revoke an in-flight return', () => {
  assert.equal(confirmedProfileReturnJobId({ ...state, privateAvailable: false }), null);
  assert.equal(confirmedProfileReturnJobId({ ...state, currentJobId: other }), null);
  assert.equal(confirmedProfileReturnJobId({ ...state, currentJobId: null }), null);
});
