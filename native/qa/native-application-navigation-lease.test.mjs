import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageNavigationLeaseIsCurrent } from '../src/lib/messageNavigationLease.ts';

const A = JSON.stringify(['synthetic-candidate-a', 'synthetic-session-a']);
const B = JSON.stringify(['synthetic-candidate-b', 'synthetic-session-b']);
const APPLICATION_A = '00000000-0000-4000-8000-000000000001';
const APPLICATION_B = '00000000-0000-4000-8000-000000000002';
const current = () => ({
  applicationId: APPLICATION_A,
  authorizedApplicationIds: [APPLICATION_A],
  expectedOwnerKey: A,
  resolvedOwnerKey: A,
  freshlyVerifiedOwnerKey: A,
  startedGeneration: 4,
  currentGeneration: 4,
  privateDataAllowed: true,
});

test('canonical application row and current pinned candidate allow detail navigation', () => {
  assert.equal(messageNavigationLeaseIsCurrent(current()), true);
});
test('a detail tap is rejected after focus departure or canonical refresh', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), currentGeneration: 5 }), false);
});
test('a late pin after account or session replacement is rejected', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), resolvedOwnerKey: B }), false);
});
test('an old application row cannot navigate across lock and unlock without reread', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), privateDataAllowed: false }), false);
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), freshlyVerifiedOwnerKey: null }), false);
});
test('missing, unauthorized or revoked application IDs cannot be navigated', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), applicationId: APPLICATION_B }), false);
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), authorizedApplicationIds: [] }), false);
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), applicationId: '' }), false);
});
test('navigation lease can be reacquired only after fresh canonical read', () => {
  assert.equal(messageNavigationLeaseIsCurrent({ ...current(), startedGeneration: 5, currentGeneration: 5 }), true);
});
