import test from 'node:test';
import assert from 'node:assert/strict';
import { canRetainVerifiedNotificationSnapshot } from '../src/lib/notificationVerifiedRefresh.ts';

const verified = Object.freeze({ ownerKey: 'candidate-A:session-1', verifiedOwnerKey: 'candidate-A:session-1', privateAllowed: true });

test('verified same-session notifications stay visible through a harmless refresh', () => {
  assert.equal(canRetainVerifiedNotificationSnapshot(verified), true);
  // A later read failure is not equivalent to an empty list; the UI can keep
  // last-verified rows while showing an error and disabling mark-all.
  assert.equal(canRetainVerifiedNotificationSnapshot({ ...verified }), true);
});

test('first load and unverified notification rows never qualify', () => {
  assert.equal(canRetainVerifiedNotificationSnapshot({ ...verified, verifiedOwnerKey: null }), false);
});

test('a distinct Clerk session of the same candidate revokes the retained view', () => {
  assert.equal(canRetainVerifiedNotificationSnapshot({ ...verified, ownerKey: 'candidate-A:session-2' }), false);
});

test('different candidate cannot see or retain previously verified notifications', () => {
  assert.equal(canRetainVerifiedNotificationSnapshot({ ...verified, ownerKey: 'candidate-B:session-1' }), false);
});

test('App Lock and privacy quarantine revoke presentation immediately', () => {
  assert.equal(canRetainVerifiedNotificationSnapshot({ ...verified, privateAllowed: false }), false);
});

test('signed-out state never reuses private notifications', () => {
  assert.equal(canRetainVerifiedNotificationSnapshot({ ...verified, ownerKey: null }), false);
});

test('invalid verification on a signed-out session never enables a view', () => {
  assert.equal(canRetainVerifiedNotificationSnapshot({ ownerKey: null, verifiedOwnerKey: null, privateAllowed: true }), false);
});

import { candidateNotificationCountPresentation, candidateNotificationEmptyPresentation } from '../src/lib/notificationListPresentation.ts';
const staleRows = { loaded: true, visibleCount: 2, visibleUnreadCount: 1, unreadCount: 1 };
test('a retained list never enables mark-all or claims a fresh count during refresh', () => {
  const state = candidateNotificationCountPresentation({ ...staleRows, loading: true, hasCanonicalError: false });
  assert.equal(state.kind, 'unavailable');
});
test('a failed refresh keeps rows but never claims zero/unread availability or empty state', () => {
  const state = candidateNotificationCountPresentation({ ...staleRows, loading: false, hasCanonicalError: true });
  assert.equal(state.kind, 'unavailable');
  assert.equal(candidateNotificationEmptyPresentation({ loaded: true, loading: false, hasCanonicalError: true,
    visibleCount: 0, unreadCount: 0 }), 'hidden');
});
test('a successful canonical read restores the confirmed unread count', () => {
  const state = candidateNotificationCountPresentation({ ...staleRows, loading: false, hasCanonicalError: false });
  assert.equal(state.kind, 'unread');
});
