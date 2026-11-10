import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationDecisionGate } from '../src/lib/applicationDecisionGate.ts';

test('two same-frame decision taps cannot start two RPCs', () => {
  const gate = createApplicationDecisionGate();
  const first = gate.begin();
  assert.equal(typeof first, 'number');
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.begin(), null);
  assert.equal(gate.isCurrent(first), true);
});

test('normal success and failure both release the lease once', () => {
  const gate = createApplicationDecisionGate();
  const initial = gate.begin();
  assert.equal(gate.finish(initial), true);
  assert.equal(gate.finish(initial), false);
  assert.equal(gate.isBusy(), false);
  const next = gate.begin();
  assert.ok(next > initial);
  assert.equal(gate.finish(next), true);
});

test('blur revokes presentation while keeping the in-flight operation locked', () => {
  const gate = createApplicationDecisionGate();
  const old = gate.begin();
  gate.revoke();
  assert.equal(gate.begin(), null); // No duplicate on blur/focus.
  assert.equal(gate.isCurrent(old), false);
  assert.equal(gate.finish(old), false); // Completion has no presentation rights.
  const fresh = gate.begin();
  assert.ok(fresh > old);
  assert.equal(gate.isCurrent(fresh), true);
  assert.equal(gate.finish(fresh), true);
});

test('a stale operation cannot clear a newer action on the same route', () => {
  const gate = createApplicationDecisionGate();
  const beforeLock = gate.begin();
  gate.revoke();
  assert.equal(gate.begin(), null);
  assert.equal(gate.finish(beforeLock), false);
  const afterUnlock = gate.begin();
  assert.equal(gate.finish(beforeLock), false);
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.finish(afterUnlock), true);
});

test('invalid and expired lease tokens do not mutate the gate', () => {
  const gate = createApplicationDecisionGate();
  const token = gate.begin();
  for (const candidate of [0, -1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(gate.isCurrent(candidate), false);
    assert.equal(gate.finish(candidate), false);
  }
  assert.equal(gate.isCurrent(token), true);
  assert.equal(gate.finish(token), true);
});
