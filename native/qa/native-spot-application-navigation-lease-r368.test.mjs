import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenVerifiedSpotApplication } from '../src/lib/spotApplicationNavigation.ts';

const a = 'b2c4b6e8-5f70-4a1b-9fe0-512b7a217eb2';
const b = '817d4732-a7f7-4ab2-885b-e868361eb1a3';
const owner = 'candidate-a:clerk-session-1';
const snapshot = () => ({
  applicationId: a,
  visibleApplicationIds: [a, b, null],
  expectedOwnerKey: owner,
  currentOwnerKey: owner,
  verifiedOwnerKey: owner,
  resolvedOwnerKey: owner,
  startedGeneration: 6,
  currentGeneration: 6,
  privateAllowed: true,
  applicationPending: false,
});

test('canonical same-candidate Spot application may open', () => {
  assert.equal(canOpenVerifiedSpotApplication(snapshot()), true);
});

test('no navigation from a fabricated, removed or malformed application ID', () => {
  assert.equal(canOpenVerifiedSpotApplication({ ...snapshot(), applicationId: '00000000-0000-0000-0000-000000000000' }), false);
  assert.equal(canOpenVerifiedSpotApplication({ ...snapshot(), applicationId: 'injected-id' }), false);
  assert.equal(canOpenVerifiedSpotApplication({ ...snapshot(), visibleApplicationIds: [b, null] }), false);
});

for (const [reason, patch] of [
  ['another candidate after account switch', { currentOwnerKey: 'candidate-b:clerk-session-2' }],
  ['a snapshot from another candidate', { verifiedOwnerKey: 'candidate-b:clerk-session-2' }],
  ['Clerk token pinned for another candidate', { resolvedOwnerKey: 'candidate-b:clerk-session-2' }],
  ['the screen was blurred or refetched after tap', { currentGeneration: 7 }],
  ['privacy lock has engaged', { privateAllowed: false }],
  ['a Spot submission is still running', { applicationPending: true }],
  ['candidate signed out', { expectedOwnerKey: null }],
  ['snapshot has never been verified', { verifiedOwnerKey: null }],
  ['the generation is invalid', { startedGeneration: NaN }],
]) {
  test(`no navigation when ${reason}`, () => {
    assert.equal(canOpenVerifiedSpotApplication({ ...snapshot(), ...patch }), false);
  });
}

test('a pin returning to an unchanged owner cannot override a newly revoked session', () => {
  const requested = snapshot();
  assert.equal(canOpenVerifiedSpotApplication(requested), true);
  assert.equal(canOpenVerifiedSpotApplication({ ...requested, currentGeneration: requested.startedGeneration + 1 }), false);
});
