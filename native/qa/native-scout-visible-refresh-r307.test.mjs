import assert from 'node:assert/strict';
import test from 'node:test';
import { SCOUT_VISIBLE_REFRESH_MS, mayRefreshVisibleScoutInbox } from '../src/lib/scoutVisibleRefreshPolicy.ts';

const state = (overrides = {}) => ({
  appActive: true,
  privateAllowed: true,
  ownerKey: 'candidate:synthetic-session',
  verifiedOwnerKey: 'candidate:synthetic-session',
  scoutsVerified: true,
  loading: false,
  busy: false,
  writePending: false,
  searchPending: false,
  refreshPending: false,
  ...overrides,
});

test('visible 60-second refresh cadence matches Web ScoutInbox', () => {
  assert.equal(SCOUT_VISIBLE_REFRESH_MS, 60_000);
  assert.equal(mayRefreshVisibleScoutInbox(state()), true);
});
test('background and inactive app never starts polling read', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state({appActive:false})), false);
});
test('shielded or revoked private access never starts polling read', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state({privateAllowed:false})), false);
});
test('signed-out candidate cannot poll', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state({ownerKey:null,verifiedOwnerKey:null})), false);
  assert.equal(mayRefreshVisibleScoutInbox(state({ownerKey:'' ,verifiedOwnerKey:''})), false);
});
test('account change without canonical revalidation cannot poll prior candidate', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state({ownerKey:'candidate:other'})), false);
  assert.equal(mayRefreshVisibleScoutInbox(state({verifiedOwnerKey:null})), false);
});
test('unverified inbox is never treated as an empty, current list', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state({scoutsVerified:false})), false);
  assert.equal(mayRefreshVisibleScoutInbox(state({loading:true})), false);
});
test('active scout mutation prevents poll racing decision or settings', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state({busy:true})), false);
  assert.equal(mayRefreshVisibleScoutInbox(state({writePending:true})), false);
});
test('block search and prior refresh must settle before next poll', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state({searchPending:true})), false);
  assert.equal(mayRefreshVisibleScoutInbox(state({refreshPending:true})), false);
});
test('preferences draft never blocks read-only inbox refresh', () => {
  // Uncommitted matching preferences are intentionally not in this predicate:
  // the caller only rereads the Scout Inbox and never hydrates the draft.
  assert.equal(mayRefreshVisibleScoutInbox(state()), true);
});
