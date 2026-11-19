import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpotReadSingleFlight } from '../src/lib/spotReadSingleFlight.ts';

const ownerA = 'candidate-a:session-1';
const ownerB = 'candidate-b:session-2';

test('null owner cannot acquire a private read lease', () => {
  const gate = createSpotReadSingleFlight();
  assert.equal(gate.begin(null), null);
  assert.equal(gate.isBusy(null), false);
});

test('double-tap retry does not launch two reads for the same owner', () => {
  const gate = createSpotReadSingleFlight();
  const first = gate.begin(ownerA);
  assert.ok(first);
  assert.equal(gate.begin(ownerA), null);
  assert.equal(gate.isBusy(ownerA), true);
  assert.equal(gate.isCurrent(first), true);
});

test('quiet foreground refresh cannot overlap a visible retry', () => {
  const gate = createSpotReadSingleFlight();
  const visible = gate.begin(ownerA);
  assert.ok(visible);
  assert.equal(gate.begin(ownerA), null);
  gate.finish(visible);
  const refreshed = gate.begin(ownerA);
  assert.ok(refreshed);
  assert.notEqual(refreshed.token, visible.token);
});

test('a completed read releases only its own lease', () => {
  const gate = createSpotReadSingleFlight();
  const first = gate.begin(ownerA);
  assert.ok(first);
  gate.finish(first);
  assert.equal(gate.isBusy(ownerA), false);
  const next = gate.begin(ownerA);
  assert.ok(next);
  gate.finish(first);
  assert.equal(gate.isCurrent(next), true);
});

test('blur and immediate refocus permit a fresh read even if the old RPC hangs', () => {
  const gate = createSpotReadSingleFlight();
  const old = gate.begin(ownerA);
  assert.ok(old);
  gate.invalidate();
  const fresh = gate.begin(ownerA);
  assert.ok(fresh);
  assert.equal(gate.isCurrent(old), false);
  gate.finish(old);
  assert.equal(gate.isCurrent(fresh), true);
});

test('account switch replaces stale owner without another owner being blocked', () => {
  const gate = createSpotReadSingleFlight();
  const old = gate.begin(ownerA);
  assert.ok(old);
  const replacement = gate.begin(ownerB);
  assert.ok(replacement);
  assert.equal(gate.isBusy(ownerA), false);
  assert.equal(gate.isBusy(ownerB), true);
  gate.finish(old);
  assert.equal(gate.isCurrent(replacement), true);
});

test('a stale read release cannot mask a newer foreground request', () => {
  const gate = createSpotReadSingleFlight();
  const first = gate.begin(ownerA);
  assert.ok(first);
  gate.invalidate();
  const current = gate.begin(ownerA);
  assert.ok(current);
  gate.finish(first);
  assert.equal(gate.begin(ownerA), null);
  gate.finish(current);
  assert.equal(gate.isBusy(ownerA), false);
});
