import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyApplicationDocumentHandoff,
  readApplicationDocumentHandoff,
} from '../src/lib/applicationDocumentHandoffStatus.ts';

const complete = { expectedCount: 0, submittedFromVaultCount: 0, missingSourceDocumentIds: [] };
const missing = { expectedCount: 2, submittedFromVaultCount: 1, missingSourceDocumentIds: ['synthetic-document-1'] };

test('unknown document state is never marked complete', () => {
  assert.equal(classifyApplicationDocumentHandoff(null), 'unverified');
});
test('canonical zero missing is confirmed', () => {
  assert.equal(classifyApplicationDocumentHandoff(complete), 'confirmed');
});
test('canonical missing source document remains actionable', () => {
  assert.equal(classifyApplicationDocumentHandoff(missing), 'missing');
});
test('successful canonical read is returned unchanged', async () => {
  assert.deepEqual(await readApplicationDocumentHandoff(async () => missing), missing);
});
test('network failure is an unverified read, not an empty document list', async () => {
  const result = await readApplicationDocumentHandoff(async () => { throw new Error('offline'); });
  assert.equal(result, null);
  assert.equal(classifyApplicationDocumentHandoff(result), 'unverified');
});
test('authorization revocation does not appear as a completed handoff', async () => {
  const result = await readApplicationDocumentHandoff(async () => { throw new Error('permission denied'); });
  assert.equal(classifyApplicationDocumentHandoff(result), 'unverified');
});
