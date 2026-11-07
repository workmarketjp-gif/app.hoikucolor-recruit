import assert from 'node:assert/strict';
import test from 'node:test';
import { canAttemptProfileSave, profileWriteFailureNeedsReload,
  profileReloadNeedsDiscardConfirmation } from '../src/lib/profileWriteRecovery.ts';

const ready = { ownerKey: '["candidateA","session1"]', loadedOwnerKey: '["candidateA","session1"]',
  privateAllowed: true, loading: false, saving: false, needsCanonicalReload: false };

test('current, canonical-loaded, unshielded candidate can save', () => {
  assert.equal(canAttemptProfileSave(ready), true);
});
test('account/session replacement, loading, lock and concurrent submit fail closed', () => {
  for (const change of [
    { ownerKey: '["candidateB","session1"]' },
    { ownerKey: '["candidateA","session2"]' },
    { ownerKey: null }, { loadedOwnerKey: null },
    { privateAllowed: false }, { loading: true }, { saving: true },
  ]) assert.equal(canAttemptProfileSave({ ...ready, ...change }), false);
});
test('an ambiguous upsert/readback failure blocks further writes', () => {
  assert.equal(profileWriteFailureNeedsReload(true), true);
  assert.equal(canAttemptProfileSave({ ...ready, needsCanonicalReload: true }), false);
});
test('local validation and preflight failures remain editable and retryable', () => {
  assert.equal(profileWriteFailureNeedsReload(false), false);
  assert.equal(canAttemptProfileSave(ready), true);
});
test('canonical refresh requires explicit discard if local edits remain', () => {
  assert.equal(profileReloadNeedsDiscardConfirmation(true), true);
  assert.equal(profileReloadNeedsDiscardConfirmation(false), false);
});
