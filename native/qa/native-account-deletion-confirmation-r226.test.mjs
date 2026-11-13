import assert from 'node:assert/strict';
import test from 'node:test';
import { canBeginCandidateDeletion, canConfirmCandidateDeletion } from '../src/lib/candidateDeletionConfirmation.ts';
import { candidateViewOwnerKey } from '../src/lib/candidateViewOwner.ts';

const ownerA = candidateViewOwnerKey('synthetic-A', 'session-1');
const ownerB = candidateViewOwnerKey('synthetic-B', 'session-2');
const live = (ownerKey = ownerA, changes = {}) => ({
  ownerKey, privateAllowed: true, deletionBusy: false,
  deletionCanRequest: true, ...changes,
});
const pin = (ownerId = 'synthetic-A', ownerSessionId = 'session-1', isCurrent = () => true) =>
  ({ ownerId, ownerSessionId, isCurrent });

test('same verified user/session with clear deletion status may open and accept confirmation', () => {
  assert.equal(canConfirmCandidateDeletion(ownerA, live()), true);
  assert.equal(canBeginCandidateDeletion(ownerA, pin()), true);
});

test('old alert from A never authorizes account B or a replacement session of A', () => {
  assert.equal(canConfirmCandidateDeletion(ownerA, live(ownerB)), false);
  assert.equal(canConfirmCandidateDeletion(ownerA, live(candidateViewOwnerKey('synthetic-A', 'session-2'))), false);
  assert.equal(canConfirmCandidateDeletion(null, live()), false);
  assert.equal(canBeginCandidateDeletion(ownerA, pin('synthetic-B', 'session-2')), false);
  assert.equal(canBeginCandidateDeletion(ownerA, pin('synthetic-A', 'session-2')), false);
});

test('App Lock and unread/busy/non-cancellable deletion status revoke confirmation', () => {
  assert.equal(canConfirmCandidateDeletion(ownerA, live(ownerA, { privateAllowed: false })), false);
  assert.equal(canConfirmCandidateDeletion(ownerA, live(ownerA, { deletionBusy: true })), false);
  assert.equal(canConfirmCandidateDeletion(ownerA, live(ownerA, { deletionCanRequest: false })), false);
});

test('token acquisition after a session switch cannot begin the deletion RPC', async () => {
  let resolvePin;
  let writes = 0;
  const operation = (async () => {
    const pinned = await new Promise(resolve => { resolvePin = resolve; });
    if (canBeginCandidateDeletion(ownerA, pinned)) writes += 1;
  })();
  resolvePin(pin('synthetic-B', 'session-2'));
  await operation;
  assert.equal(writes, 0);
});

test('revoked, absent or malformed pin never begins a deletion RPC', () => {
  assert.equal(canBeginCandidateDeletion(ownerA, pin('synthetic-A', 'session-1', () => false)), false);
  assert.equal(canBeginCandidateDeletion(ownerA, null), false);
  assert.equal(canBeginCandidateDeletion(null, pin()), false);
  assert.equal(canBeginCandidateDeletion(ownerA, pin('', 'session-1')), false);
});
