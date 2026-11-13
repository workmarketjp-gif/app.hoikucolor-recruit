import test from 'node:test';
import assert from 'node:assert/strict';
import { canPreserveMessageInboxDuringManualRefresh, canOpenVerifiedMessageInboxThread } from '../src/lib/messageInboxRefreshPolicy.ts';

const verified = { manual: true, expectedOwnerKey: '["candidate-a","session-a"]', lastVerifiedOwnerKey: '["candidate-a","session-a"]', privateAccessAllowed: true, navigationPending: false };

test('manual same-session refresh may retain verified thread rows', () => {
  assert.equal(canPreserveMessageInboxDuringManualRefresh(verified), true);
  assert.equal(canPreserveMessageInboxDuringManualRefresh({ ...verified, manual: false }), false);
});
test('App Lock, logout, account/session switch, navigation quarantine cached rows', () => {
  for (const change of [{ privateAccessAllowed: false }, { expectedOwnerKey: null }, { lastVerifiedOwnerKey: null }, { expectedOwnerKey: '["candidate-b","session-b"]' }, { expectedOwnerKey: '["candidate-a","new-session"]' }, { navigationPending: true }]) {
    assert.equal(canPreserveMessageInboxDuringManualRefresh({ ...verified, ...change }), false);
  }
});
test('stale or pending rows never grant message navigation', () => {
  const ready = { listPresent: true, currentOwnerVerified: true, refreshInFlight: false, refreshFailed: false };
  assert.equal(canOpenVerifiedMessageInboxThread(ready), true);
  for (const change of [{ listPresent: false }, { currentOwnerVerified: false }, { refreshInFlight: true }, { refreshFailed: true }]) assert.equal(canOpenVerifiedMessageInboxThread({ ...ready, ...change }), false);
});
