import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationCardOpenGate } from '../src/lib/notificationCardOpenGate.ts';

test('synchronous duplicate taps in same candidate/session for same notification are blocked', () => {
  const gate = createNotificationCardOpenGate();
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), true);
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), false);
  assert.equal(gate.isPending('candidateA:session1', 'notification1'), true);
});

test('two distinct notifications remain independently tappable', () => {
  const gate = createNotificationCardOpenGate();
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), true);
  assert.equal(gate.tryStart('candidateA:session1', 'notification2'), true);
  gate.complete('candidateA:session1', 'notification1');
  assert.equal(gate.isPending('candidateA:session1', 'notification1'), false);
  assert.equal(gate.isPending('candidateA:session1', 'notification2'), true);
});

test('account/session switch never borrows the previous session gate', () => {
  const gate = createNotificationCardOpenGate();
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), true);
  assert.equal(gate.tryStart('candidateA:session2', 'notification1'), true);
  assert.equal(gate.tryStart('candidateB:session1', 'notification1'), true);
  gate.complete('candidateA:session1', 'notification1');
  assert.equal(gate.isPending('candidateB:session1', 'notification1'), true);
  assert.equal(gate.isPending('candidateA:session2', 'notification1'), true);
});

test('ambiguous result releases the gate only when finally executes', () => {
  const gate = createNotificationCardOpenGate();
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), true);
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), false);
  gate.complete('candidateA:session1', 'notification1');
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), true);
});

test('missing owner or notification cannot acquire a gate', () => {
  const gate = createNotificationCardOpenGate();
  assert.equal(gate.tryStart('', 'notification1'), false);
  assert.equal(gate.tryStart('candidateA:session1', ''), false);
  assert.equal(gate.isPending('candidateA:session1', 'notification1'), false);
});

test('duplicate completion or unknown key is harmless', () => {
  const gate = createNotificationCardOpenGate();
  gate.complete('candidateA:session1', 'notification1');
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), true);
  gate.complete('candidateA:session1', 'notification1');
  gate.complete('candidateA:session1', 'notification1');
  assert.equal(gate.tryStart('candidateA:session1', 'notification1'), true);
});
