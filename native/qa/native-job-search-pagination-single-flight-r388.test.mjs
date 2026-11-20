import assert from 'node:assert/strict';
import test from 'node:test';
import { canStartJobSearchPaginationRead } from '../src/lib/jobSearchPaginationFlight.ts';

const base = {
  ownerKey: 'candidateA:sessionA',
  currentOwnerKey: 'candidateA:sessionA',
  isPrivateVisible: true,
  isFocused: true,
  hasVerifiedPage: true,
  hasMore: true,
  currentGeneration: 12,
  inFlightGeneration: null,
};

test('canonical verified next page may load once with current candidate session', () => {
  assert.equal(canStartJobSearchPaginationRead(base), true);
});

test('two pagination taps in the same render cannot start duplicate RPCs', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, inFlightGeneration: 12 }), false);
});

test('a settled failed request can be explicitly retried', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, inFlightGeneration: null }), true);
});

test('an invalidated older request cannot block current-generation pagination', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, inFlightGeneration: 11 }), true);
});

test('initial or unknown search state cannot be paginated', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, hasVerifiedPage: false }), false);
});

test('no next cursor: never fabricate another page', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, hasMore: false }), false);
});

test('logout, account switch, missing owner all quarantine pagination', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, ownerKey: null }), false);
  assert.equal(canStartJobSearchPaginationRead({ ...base, currentOwnerKey: null }), false);
  assert.equal(canStartJobSearchPaginationRead({ ...base, currentOwnerKey: 'candidateB:sessionB' }), false);
});

test('App Lock and unfocused tab prevent a new private RPC', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, isPrivateVisible: false }), false);
  assert.equal(canStartJobSearchPaginationRead({ ...base, isFocused: false }), false);
});

test('generation zero and other finite generation numbers are supported without sentinel ambiguity', () => {
  assert.equal(canStartJobSearchPaginationRead({ ...base, currentGeneration: 0, inFlightGeneration: 0 }), false);
  assert.equal(canStartJobSearchPaginationRead({ ...base, currentGeneration: 0, inFlightGeneration: -1 }), true);
});
