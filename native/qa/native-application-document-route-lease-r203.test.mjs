import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateViewOwnerKey, candidateApplicationViewOwnerKey, readCandidateFreshlyVerifiedView } from '../src/lib/candidateViewOwner.ts';

// This exercises the actual Native presentation helper. The mounted component
// and physical-device behavior still need Expo/Android/iOS validation.
test('document presentation lease includes application identity, not only candidate/session', () => {
  const owner = candidateViewOwnerKey('candidate-A', 'session-A');
  const applicationA = candidateApplicationViewOwnerKey(owner, 'application-A');
  const applicationB = candidateApplicationViewOwnerKey(owner, 'application-B');
  assert.ok(applicationA);
  assert.ok(applicationB);
  assert.notEqual(applicationA, applicationB);
  const prior = { ownerKey: applicationA, value: { saved: [{ id: 'A-doc' }], submitted: [], expectations: [] } };
  assert.deepEqual(readCandidateFreshlyVerifiedView(prior, applicationA, true, applicationA), prior.value);
  assert.equal(readCandidateFreshlyVerifiedView(prior, applicationB, true, applicationA), null,
    'a mounted documents component must not render application A while visiting B');
});

test('switch A -> B -> A still requires a fresh canonical read on return', () => {
  const owner = candidateViewOwnerKey('candidate-A', 'session-A');
  const a = candidateApplicationViewOwnerKey(owner, 'A');
  const b = candidateApplicationViewOwnerKey(owner, 'B');
  const prior = { ownerKey: a, value: { saved: [{ id: 'old-A' }] } };
  assert.equal(readCandidateFreshlyVerifiedView(prior, b, true, a), null);
  assert.equal(readCandidateFreshlyVerifiedView(prior, a, true, null), null);
});

test('no route identity or no verified Clerk session means no document lease', () => {
  const owner = candidateViewOwnerKey('candidate-A', 'session-A');
  assert.equal(candidateApplicationViewOwnerKey(owner, ''), null);
  assert.equal(candidateApplicationViewOwnerKey(owner, '   '), null);
  assert.equal(candidateApplicationViewOwnerKey(null, 'A'), null);
  assert.equal(candidateApplicationViewOwnerKey('', 'A'), null);
  assert.notEqual(candidateApplicationViewOwnerKey(owner, 'a|b'), candidateApplicationViewOwnerKey(owner, 'a|b '));
});
