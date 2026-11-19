import assert from 'node:assert/strict';
import test from 'node:test';
import { canRefreshSpotInForeground } from '../src/lib/spotForegroundRefresh.ts';

const owner = 'candidate-a:session-1';
const initialFailure = () => ({
  foreground: true,
  ownerKey: owner,
  currentOwnerKey: owner,
  verifiedOwnerKey: null,
  initialFailureOwnerKey: owner,
  privateAllowed: true,
  readInFlight: false,
  applicationInFlight: false,
});

test('initial read failure may recover in foreground without pretending to have a verified snapshot', () => {
  assert.equal(canRefreshSpotInForeground(initialFailure()), true);
});

test('verified existing snapshot still receives quiet refresh', () => {
  assert.equal(canRefreshSpotInForeground({ ...initialFailure(), verifiedOwnerKey: owner, initialFailureOwnerKey: null }), true);
});

test('initial loading without a recorded failure is not eligible for quiet read', () => {
  assert.equal(canRefreshSpotInForeground({ ...initialFailure(), initialFailureOwnerKey: null }), false);
});

for (const [description, state] of [
  ['different candidate session', { currentOwnerKey: 'candidate-b:session-2' }],
  ['failure recorded for another candidate', { initialFailureOwnerKey: 'candidate-b:session-2' }],
  ['verified snapshot for a different candidate', { verifiedOwnerKey: 'candidate-b:session-2' }],
  ['signed-out state', { ownerKey: null, currentOwnerKey: null }],
  ['background', { foreground: false }],
  ['private lock', { privateAllowed: false }],
  ['existing read in progress', { readInFlight: true }],
  ['application submission in progress', { applicationInFlight: true }],
]) {
  test(`initial failure does not refresh when ${description}`, () => {
    assert.equal(canRefreshSpotInForeground({ ...initialFailure(), ...state }), false);
  });
}
