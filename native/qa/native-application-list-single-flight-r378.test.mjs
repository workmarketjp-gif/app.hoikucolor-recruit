import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartApplicationIndexRead } from '../src/lib/applicationIndexRefreshFlight.ts';

const base = { pending: false, expectedOwnerKey: '["candidate-A","session-A"]', privateAllowed: true };

test('one verified foreground candidate application read may start', () => {
  assert.equal(canStartApplicationIndexRead(base), true);
});

test('a same-frame second tap cannot start another private RPC while the first is pending', () => {
  assert.equal(canStartApplicationIndexRead({ ...base, pending: true }), false);
});

test('a finished request permits an explicit retry', () => {
  const pending = { ...base, pending: true };
  assert.equal(canStartApplicationIndexRead(pending), false);
  assert.equal(canStartApplicationIndexRead({ ...pending, pending: false }), true);
});

test('signed-out account cannot initiate a private read', () => {
  assert.equal(canStartApplicationIndexRead({ ...base, expectedOwnerKey: null }), false);
});

test('App Lock and background prevent private application reads', () => {
  assert.equal(canStartApplicationIndexRead({ ...base, privateAllowed: false }), false);
});
