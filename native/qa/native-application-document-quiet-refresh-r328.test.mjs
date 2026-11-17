import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseApplicationDocumentSnapshotForAction } from '../src/lib/applicationDocumentReadFreshness.ts';

const canUse = (snapshot, verified) => canUseApplicationDocumentSnapshotForAction(snapshot, verified);

test('verified current-owner snapshot allows action before a new read', () => {
  assert.equal(canUse(true, true), true);
});
test('an initially empty snapshot cannot be used as an action authority', () => {
  assert.equal(canUse(false, true), false);
});
test('an in-progress quiet refresh revokes action authority despite visible old rows', () => {
  assert.equal(canUse(true, false), false);
});
test('silent polling failure must not reenable attach/open using old rows', () => {
  let verified = true;
  assert.equal(canUse(true, verified), true);
  verified = false; // Poll starts and then rejects (or times out).
  assert.equal(canUse(true, verified), false);
});
test('complete authorized readback restores actions without discarding old rows', () => {
  assert.equal(canUse(true, false), false);
  assert.equal(canUse(true, true), true);
});
test('logout, account switch or App Lock revocation blocks action even with previous success', () => {
  assert.equal(canUse(false, true), false);
  assert.equal(canUse(false, false), false);
});
test('an abandoned read never authorizes another owner snapshot', () => {
  assert.equal(canUse(false, false), false);
});
test('the policy makes no write or read callback and does not retry', () => {
  assert.equal(canUse(true, false), false);
});
