import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createVaultOperationLease } from '../src/lib/vaultOperationLease.ts';

test('double tap cannot launch two pickers before React updates', () => {
  const gate = createVaultOperationLease();
  const first = gate.tryAcquire();
  assert.equal(typeof first, 'number');
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.tryAcquire(), null);
  assert.equal(gate.release(first), true);
  assert.equal(gate.isBusy(), false);
  assert.equal(typeof gate.tryAcquire(), 'number');
});

test('a stale completion cannot unlock a newer operation after account switch', () => {
  const gate = createVaultOperationLease();
  const oldToken = gate.tryAcquire();
  gate.reset();
  const newToken = gate.tryAcquire();
  assert.notEqual(oldToken, newToken);
  assert.equal(gate.release(oldToken), false);
  assert.equal(gate.isBusy(), true);
  assert.equal(gate.release(newToken), true);
  assert.equal(gate.isBusy(), false);
});

test('unmatched operation completions never unlock the active action', () => {
  const gate = createVaultOperationLease();
  const current = gate.tryAcquire();
  assert.equal(gate.release(-1), false);
  assert.equal(gate.tryAcquire(), null);
  assert.equal(gate.release(current), true);
  assert.equal(gate.release(current), false);
});

test('cancel/rejected picker can release its lease and safely retry', () => {
  const gate = createVaultOperationLease();
  for (let i = 0; i < 3; i += 1) {
    const token = gate.tryAcquire();
    assert.ok(token !== null);
    assert.equal(gate.release(token), true);
  }
});

test('real Native vault serializes picker, camera, open, default, and delete paths', () => {
  const source = readFileSync(new URL('../src/components/DocumentVaultSection.tsx', import.meta.url), 'utf8');
  assert.match(source, /const operationLeaseRef = useRef\(createVaultOperationLease\(\)\)/);
  assert.match(source, /operationLeaseRef\.current\.reset\(\)/);
  assert.equal((source.match(/operationLeaseRef\.current\.tryAcquire\(\)/g) ?? []).length, 5);
  assert.equal((source.match(/operationLeaseRef\.current\.release\(lease\)/g) ?? []).length, 5);
});
