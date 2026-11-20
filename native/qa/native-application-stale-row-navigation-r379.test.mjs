import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canNavigateVerifiedApplicationRow,
  retainApplicationListForRefresh,
} from '../src/lib/applicationListRefreshPolicy.ts';

const A = '["candidate-A","session-A"]';
const B = '["candidate-B","session-B"]';
const fresh = { ownerKey: A, freshlyVerifiedOwnerKey: A, hasVisibleRows: true,
  privateAllowed: true, navigationPending: false };

test('confirmed same-session rows remain navigable during explicit refresh and after its failure', () => {
  assert.equal(retainApplicationListForRefresh({ explicitRefresh: true, ownerKey: A,
    freshlyVerifiedOwnerKey: A, privateAllowed: true }), true);
  assert.equal(canNavigateVerifiedApplicationRow(fresh), true);
});

test('a newly loaded verified list is navigable even when empty-data is a verified []', () => {
  assert.equal(canNavigateVerifiedApplicationRow(fresh), true);
});

test('initial load or failed first read without verified rows is not navigable', () => {
  assert.equal(canNavigateVerifiedApplicationRow({ ...fresh, hasVisibleRows: false }), false);
});

test('a second rapid press cannot open a duplicate application detail', () => {
  assert.equal(canNavigateVerifiedApplicationRow({ ...fresh, navigationPending: true }), false);
});

test('logout revokes all previously confirmed rows', () => {
  assert.equal(canNavigateVerifiedApplicationRow({ ...fresh, ownerKey: null }), false);
});

test('candidate switch cannot expose previous account application', () => {
  assert.equal(canNavigateVerifiedApplicationRow({ ...fresh, ownerKey: B }), false);
});

test('same account but different Clerk session cannot expose previous snapshot', () => {
  const A2 = '["candidate-A","session-new"]';
  assert.equal(canNavigateVerifiedApplicationRow({ ...fresh, ownerKey: A2 }), false);
});

test('app lock and background prohibit row navigation', () => {
  assert.equal(canNavigateVerifiedApplicationRow({ ...fresh, privateAllowed: false }), false);
});

test('failed manual refresh does not grant rows to an unverified owner', () => {
  assert.equal(retainApplicationListForRefresh({ explicitRefresh: true, ownerKey: B,
    freshlyVerifiedOwnerKey: A, privateAllowed: true }), false);
  assert.equal(canNavigateVerifiedApplicationRow({ ...fresh, freshlyVerifiedOwnerKey: null }), false);
});

test('automatic refocus cannot retain rows without a new canonical read', () => {
  assert.equal(retainApplicationListForRefresh({ explicitRefresh: false, ownerKey: A,
    freshlyVerifiedOwnerKey: A, privateAllowed: true }), false);
});
