import assert from 'node:assert/strict';
import test from 'node:test';
import { canRefreshSpotInForeground } from '../src/lib/spotForegroundRefresh.ts';

const ready = () => ({
  foreground: true,
  ownerKey: 'candidate-a:session-1',
  currentOwnerKey: 'candidate-a:session-1',
  verifiedOwnerKey: 'candidate-a:session-1',
  privateAllowed: true,
  readInFlight: false,
  applicationInFlight: false,
});

test('refreshes an existing verified candidate snapshot while active and idle', () => {
  assert.equal(canRefreshSpotInForeground(ready()), true);
});
for (const [name, mutate] of [
  ['backgrounded app', { foreground: false }],
  ['session owner changed', { currentOwnerKey: 'candidate-b:session-2' }],
  ['snapshot belongs to previous account', { verifiedOwnerKey: 'candidate-b:session-2' }],
  ['snapshot invalidated pending initial load', { verifiedOwnerKey: null }],
  ['signed out', { ownerKey: null, currentOwnerKey: null, verifiedOwnerKey: null }],
  ['app lock', { privateAllowed: false }],
  ['another Spot read in flight', { readInFlight: true }],
  ['application submission in flight', { applicationInFlight: true }],
]) {
  test(`does not refresh with ${name}`, () => {
    assert.equal(canRefreshSpotInForeground({ ...ready(), ...mutate }), false);
  });
}
