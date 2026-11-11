import assert from 'node:assert/strict';
import test from 'node:test';
import { mayShowScoutError, shouldPublishScoutRead, shouldPublishScoutInboxRefresh } from '../src/lib/scoutReadLease.ts';

const good = Object.freeze({
  expectedOwnerKey: 'candidate-A:session-1',
  resolvedOwnerKey: 'candidate-A:session-1',
  requestGeneration: 4,
  activeGeneration: 4,
  sessionCurrent: true,
  privateAccess: true,
});

test('authenticated same-session read is publishable', () => assert.equal(shouldPublishScoutRead(good), true));
test('a different candidate cannot inherit the scout inbox', () => assert.equal(shouldPublishScoutRead({ ...good, resolvedOwnerKey: 'candidate-B:session-2' }), false));
test('a different session of the same candidate cannot inherit data', () => assert.equal(shouldPublishScoutRead({ ...good, resolvedOwnerKey: 'candidate-A:session-2' }), false));
test('stale results cannot overwrite a more recent read', () => assert.equal(shouldPublishScoutRead({ ...good, activeGeneration: 5 }), false));
test('signed-out and missing-owner states fail closed', () => {
  assert.equal(shouldPublishScoutRead({ ...good, expectedOwnerKey: null, resolvedOwnerKey: null }), false);
  assert.equal(shouldPublishScoutRead({ ...good, expectedOwnerKey: '' }), false);
});
test('revoked or stale Clerk session fails closed', () => assert.equal(shouldPublishScoutRead({ ...good, sessionCurrent: false }), false));
test('App Lock and private-access quarantine fail closed', () => assert.equal(shouldPublishScoutRead({ ...good, privateAccess: false }), false));
test('non-integer generation cannot be accepted', () => assert.equal(shouldPublishScoutRead({ ...good, requestGeneration: NaN, activeGeneration: NaN }), false));
test('error remains private to exact candidate/session and unlocked view', () => {
  assert.equal(mayShowScoutError('candidate-A:session-1', 'candidate-A:session-1', true), true);
  assert.equal(mayShowScoutError('candidate-B:session-2', 'candidate-A:session-1', true), false);
  assert.equal(mayShowScoutError('candidate-A:session-1', 'candidate-A:session-1', false), false);
  assert.equal(mayShowScoutError(null, null, true), false);
});

const refresh = Object.freeze({ ...good, requestSerial: 2, activeSerial: 2 });
test('scout refresh accepts only current same-account canonical results', () => {
  assert.equal(shouldPublishScoutInboxRefresh(refresh), true);
});
test('a slower previous refresh cannot replace the newer inbox', () => {
  assert.equal(shouldPublishScoutInboxRefresh({ ...refresh, activeSerial: 3 }), false);
});
test('a full page reload invalidates older refreshed results', () => {
  assert.equal(shouldPublishScoutInboxRefresh({ ...refresh, activeGeneration: 5 }), false);
});
test('refresh during signout, account switch or App Lock is not publishable', () => {
  assert.equal(shouldPublishScoutInboxRefresh({ ...refresh, resolvedOwnerKey: 'candidate-B:session-2' }), false);
  assert.equal(shouldPublishScoutInboxRefresh({ ...refresh, sessionCurrent: false }), false);
  assert.equal(shouldPublishScoutInboxRefresh({ ...refresh, privateAccess: false }), false);
});
test('invalid or forged sequence cannot authorize an inbox refresh', () => {
  assert.equal(shouldPublishScoutInboxRefresh({ ...refresh, requestSerial: NaN, activeSerial: NaN }), false);
  assert.equal(shouldPublishScoutInboxRefresh({ ...refresh, requestSerial: 1.5, activeSerial: 1.5 }), false);
});
