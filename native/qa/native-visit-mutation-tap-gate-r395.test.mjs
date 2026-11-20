import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitMutationTapGate } from '../src/lib/visitMutationTapGate.ts';

test('duplicate same-frame request taps launch only one mutation', () => {
  const gate = createVisitMutationTapGate();
  const first = gate.begin();
  assert.equal(typeof first, 'number');
  assert.equal(gate.begin(), null);
  assert.equal(gate.isCurrent(first), true);
  assert.equal(gate.settle(first), true);
  assert.equal(gate.isPending(), false);
});

test('request and cancellation share one lane until first attempt settles', () => {
  const gate = createVisitMutationTapGate();
  const request = gate.begin();
  assert.equal(gate.begin(), null);
  assert.equal(gate.settle(request), true);
  const cancel = gate.begin();
  assert.notEqual(cancel, null);
  assert.equal(gate.isCurrent(cancel), true);
});

test('successful booking navigation keeps gate closed until blur', () => {
  const gate = createVisitMutationTapGate();
  const ticket = gate.begin();
  assert.equal(gate.settle(ticket, true), true);
  assert.equal(gate.begin(), null);
  gate.invalidate();
  assert.notEqual(gate.begin(), null);
});

test('blur or App Lock revokes inflight operation and permits fresh attempt', () => {
  const gate = createVisitMutationTapGate();
  const oldTicket = gate.begin();
  gate.invalidate();
  assert.equal(gate.isCurrent(oldTicket), false);
  const current = gate.begin();
  assert.equal(gate.isCurrent(current), true);
  assert.equal(gate.settle(oldTicket), false);
  assert.equal(gate.isCurrent(current), true);
  assert.equal(gate.begin(), null);
});

test('late success cannot retain another candidate’s gate', () => {
  const gate = createVisitMutationTapGate();
  const old = gate.begin();
  gate.invalidate();
  const next = gate.begin();
  assert.equal(gate.settle(old, true), false);
  assert.equal(gate.isCurrent(next), true);
});

test('late failure cannot prematurely release newer pending mutation', () => {
  const gate = createVisitMutationTapGate();
  const old = gate.begin();
  gate.invalidate();
  const newer = gate.begin();
  assert.equal(gate.settle(old), false);
  assert.equal(gate.isCurrent(newer), true);
  assert.equal(gate.begin(), null);
});

test('failed preflight can release lane for a deliberate new tap', () => {
  const gate = createVisitMutationTapGate();
  const ticket = gate.begin();
  assert.equal(gate.settle(ticket), true);
  assert.notEqual(gate.begin(), null);
});

test('repeated blur and old finally never alter the new pending ticket', () => {
  const gate = createVisitMutationTapGate();
  const old = gate.begin();
  gate.invalidate();
  gate.invalidate();
  const current = gate.begin();
  assert.equal(gate.settle(old), false);
  assert.equal(gate.isCurrent(current), true);
});
