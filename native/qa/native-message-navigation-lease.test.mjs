import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageNavigationLeaseIsCurrent } from '../src/lib/messageNavigationLease.ts';

const OWNER_A = JSON.stringify(['synthetic-user-A', 'synthetic-session-A']);
const OWNER_B = JSON.stringify(['synthetic-user-B', 'synthetic-session-B']);
const APP_A = '00000000-0000-4000-8000-000000000001';
const APP_B = '00000000-0000-4000-8000-000000000002';
const authorized = () => ({
  applicationId: APP_A,
  authorizedApplicationIds: [APP_A],
  expectedOwnerKey: OWNER_A,
  resolvedOwnerKey: OWNER_A,
  freshlyVerifiedOwnerKey: OWNER_A,
  startedGeneration: 12,
  currentGeneration: 12,
  privateDataAllowed: true,
});

test('verified owner and canonical inbox row permit thread navigation', () => {
  assert.equal(messageNavigationLeaseIsCurrent(authorized()), true);
});
test('App Lock or background activation rejects a pending navigation', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), privateDataAllowed: false }), false);
});
test('account replacement rejects even a row captured before the switch', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), resolvedOwnerKey: OWNER_B }), false);
});
test('an unverified same-account read after unlocking cannot navigate', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), freshlyVerifiedOwnerKey: null }), false);
});
test('an old focus/load generation cannot navigate after screen leave or refresh', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), currentGeneration: 13 }), false);
});
test('no authorized inbox row means no navigation, including revoked ids', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), applicationId: APP_B }), false);
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), authorizedApplicationIds: [] }), false);
});
test('missing owner, invalid generation, or missing application id fail closed', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), expectedOwnerKey: null }), false);
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), startedGeneration: NaN }), false);
  assert.equal(messageNavigationLeaseIsCurrent({ ...authorized(), applicationId: '' }), false);
});
test('current generation plus fresh reread restores navigation safely', () => {
  const afterRefresh = { ...authorized(), startedGeneration: 13, currentGeneration: 13 };
  assert.equal(messageNavigationLeaseIsCurrent(afterRefresh), true);
});
