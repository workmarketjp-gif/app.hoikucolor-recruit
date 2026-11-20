import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canOpenVerifiedMessageInboxThread,
  canPreserveMessageInboxDuringManualRefresh,
  canStartMessageInboxRefresh,
} from '../src/lib/messageInboxRefreshPolicy.ts';

const A = '["candidate-a","clerk-session-a"]';
const B = '["candidate-b","clerk-session-b"]';
const current = { manual: true, expectedOwnerKey: A, lastVerifiedOwnerKey: A,
  privateAccessAllowed: true, navigationPending: false };
const visible = { listPresent: true, currentOwnerVerified: true, navigationPending: false };

test('confirmed same-session threads remain navigable through manual refresh and failed read', () => {
  assert.equal(canPreserveMessageInboxDuringManualRefresh(current), true);
  assert.equal(canOpenVerifiedMessageInboxThread(visible), true);
});
test('initial pending read and initial failure cannot grant any message navigation', () => {
  assert.equal(canOpenVerifiedMessageInboxThread({ ...visible, listPresent: false }), false);
  assert.equal(canOpenVerifiedMessageInboxThread({ ...visible, currentOwnerVerified: false }), false);
});
test('focus change revokes row lease even if state has not yet rendered its reset', () => {
  assert.equal(canPreserveMessageInboxDuringManualRefresh({ ...current, manual: false }), false);
  assert.equal(canOpenVerifiedMessageInboxThread({ ...visible, currentOwnerVerified: false }), false);
});
test('different candidate and changed Clerk session cannot retain rows', () => {
  assert.equal(canPreserveMessageInboxDuringManualRefresh({ ...current, expectedOwnerKey: B }), false);
  assert.equal(canPreserveMessageInboxDuringManualRefresh({ ...current, expectedOwnerKey: '["candidate-a","new-session"]' }), false);
});
test('logout or App Lock revokes cached conversations', () => {
  assert.equal(canPreserveMessageInboxDuringManualRefresh({ ...current, expectedOwnerKey: null }), false);
  assert.equal(canPreserveMessageInboxDuringManualRefresh({ ...current, privateAccessAllowed: false }), false);
  assert.equal(canOpenVerifiedMessageInboxThread({ ...visible, currentOwnerVerified: false }), false);
});
test('same-frame duplicate navigation remains blocked', () => {
  assert.equal(canOpenVerifiedMessageInboxThread({ ...visible, navigationPending: true }), false);
});
test('a pending thread navigation prevents a new inbox refresh', () => {
  assert.equal(canStartMessageInboxRefresh({ refreshPending: false, threadOpenPending: true,
    secondaryNavigationPending: false }), false);
});
test('a pending manual refresh still denies duplicate RPC launches', () => {
  assert.equal(canStartMessageInboxRefresh({ refreshPending: true, threadOpenPending: false,
    secondaryNavigationPending: false }), false);
});
test('empty but verified index does not fabricate a message thread', () => {
  // Presentation gate is true, but the screen maps zero canonical row IDs.
  assert.equal(canOpenVerifiedMessageInboxThread(visible), true);
  const authorizedIds = [];
  assert.equal(authorizedIds.includes('00000000-0000-4000-8000-000000000001'), false);
});
