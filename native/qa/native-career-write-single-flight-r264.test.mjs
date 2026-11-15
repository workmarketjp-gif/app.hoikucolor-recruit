import test from 'node:test';
import assert from 'node:assert/strict';
import { beginCareerWrite, finishCareerWrite } from '../src/lib/careerWriteFlight.ts';

test('two immediate taps in the same render can claim only one save/delete RPC', () => {
  const ref = { current: null };
  const first = beginCareerWrite(ref, '["candidate-a","session-1"]', 1);
  assert.ok(first);
  assert.equal(beginCareerWrite(ref, '["candidate-a","session-1"]', 1), null);
  assert.equal(beginCareerWrite(ref, '["candidate-a","session-1"]', 2), null);
  finishCareerWrite(ref, first);
  const next = beginCareerWrite(ref, '["candidate-a","session-1"]', 2);
  assert.ok(next);
  finishCareerWrite(ref, next);
  assert.equal(ref.current, null);
});

test('an expired owner cannot free a new candidate session write', () => {
  const ref = { current: null };
  const stale = beginCareerWrite(ref, '["candidate-a","session-1"]', 1);
  const current = beginCareerWrite(ref, '["candidate-b","session-2"]', 3);
  assert.ok(stale && current);
  finishCareerWrite(ref, stale);
  assert.equal(ref.current, current);
  assert.equal(beginCareerWrite(ref, '["candidate-b","session-2"]', 3), null);
  finishCareerWrite(ref, current);
  assert.equal(ref.current, null);
});

test('an old session for the same user cannot unblock a replacement session', () => {
  const ref = { current: null };
  const stale = beginCareerWrite(ref, '["candidate-a","old-session"]', 1);
  const active = beginCareerWrite(ref, '["candidate-a","new-session"]', 4);
  assert.ok(stale && active);
  finishCareerWrite(ref, stale);
  assert.equal(ref.current, active);
  finishCareerWrite(ref, active);
});

test('a missing owner never acquires a private write lease', () => {
  const ref = { current: null };
  assert.equal(beginCareerWrite(ref, '', 0), null);
  assert.equal(ref.current, null);
});

test('a stale duplicate completion never clears a later lease for the same owner', () => {
  const ref = { current: null };
  const first = beginCareerWrite(ref, '["candidate-a","session-1"]', 1);
  assert.ok(first);
  finishCareerWrite(ref, first);
  const second = beginCareerWrite(ref, '["candidate-a","session-1"]', 2);
  assert.ok(second);
  finishCareerWrite(ref, first);
  assert.equal(ref.current, second);
  finishCareerWrite(ref, second);
  assert.equal(ref.current, null);
});

test('flight remains held while an asynchronous RPC acknowledgement is unresolved', async () => {
  const ref = { current: null };
  let resolve;
  const stalled = new Promise((r) => { resolve = r; });
  const simulateWrite = async () => {
    const lease = beginCareerWrite(ref, '["candidate-a","session-1"]', 1);
    if (!lease) return false;
    try { await stalled; return true; }
    finally { finishCareerWrite(ref, lease); }
  };
  const first = simulateWrite();
  assert.equal(await simulateWrite(), false);
  assert.notEqual(ref.current, null);
  resolve();
  assert.equal(await first, true);
  assert.equal(ref.current, null);
});
