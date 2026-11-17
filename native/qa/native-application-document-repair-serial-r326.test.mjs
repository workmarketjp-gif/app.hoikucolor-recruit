import test from 'node:test';
import assert from 'node:assert/strict';
import { repairApplicationDocumentsSerial } from '../src/lib/repairApplicationDocumentsSerial.ts';

const documents = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const run = (overrides = {}) => repairApplicationDocumentsSerial({
  missingSourceIds: ['a', 'b'], documents,
  getDocumentId: (document) => document.id, canContinue: () => true,
  attach: async () => undefined, ...overrides,
});

test('r326 repair: serial readback-safe attachment order', async () => {
  const begun = [];
  await run({ attach: async (d) => { begun.push(d.id); await Promise.resolve(); } });
  assert.deepEqual(begun, ['a', 'b']);
});
test('r326 repair: missing document is counted without a new attachment call', async () => {
  const calls = [];
  const result = await run({ missingSourceIds: ['missing', 'a'], attach: async (d) => { calls.push(d.id); } });
  assert.deepEqual(result, { failed: 1 });
  assert.deepEqual(calls, ['a']);
});
test('r326 repair: duplicates in expected source ids are never attached twice', async () => {
  const calls = [];
  await run({ missingSourceIds: ['a', 'a', 'b'], attach: async (d) => { calls.push(d.id); } });
  assert.deepEqual(calls, ['a', 'b']);
});
test('r326 repair: failure of an attempted write stops all subsequent writes', async () => {
  const calls = [];
  await assert.rejects(run({ attach: async (d) => { calls.push(d.id); if (d.id === 'a') throw new Error('reply lost'); } }), /reply lost/);
  assert.deepEqual(calls, ['a']);
});
test('r326 repair: revoked lease before start performs no operations', async () => {
  let calls = 0;
  await assert.rejects(run({ canContinue: () => false, attach: async () => { calls += 1; } }), /復旧結果/);
  assert.equal(calls, 0);
});
test('r326 repair: revoked lease between writes prevents later attachment', async () => {
  let current = true;
  const calls = [];
  await assert.rejects(run({
    canContinue: () => current,
    attach: async (d) => { calls.push(d.id); current = false; },
  }), /復旧結果/);
  assert.deepEqual(calls, ['a']);
});
test('r326 repair: a late in-flight attachment can observe lost lease and block further stages', async () => {
  let current = true;
  const calls = [];
  await assert.rejects(run({
    canContinue: () => current,
    attach: async (d, canContinue) => {
      calls.push(d.id);
      await Promise.resolve();
      current = false;
      assert.equal(canContinue(), false);
    },
  }), /復旧結果/);
  assert.deepEqual(calls, ['a']);
});
test('r326 repair: when no documents need repair, the canonical zero case is read-only', async () => {
  let calls = 0;
  assert.deepEqual(await run({ missingSourceIds: [], attach: async () => { calls += 1; } }), { failed: 0 });
  assert.equal(calls, 0);
});
