import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationDocumentHandoffProjection } from '../src/lib/applicationDocumentHandoffProjection.ts';
const expectation = (id) => ({ application_id: 'app-synthetic-A', source_jobseeker_document_id_snapshot: id, destination_file_path: 'synthetic/'+id, document_type:'resume' });
const attachment = (id, filePath = 'synthetic/'+id) => ({ application_id: 'app-synthetic-A', source_jobseeker_document_id: id, file_path: filePath, document_type:'resume' });

test('no expected document is confirmed with zero expected/submitted', () => {
  assert.deepEqual(applicationDocumentHandoffProjection([], []), {
    expectedCount: 0, submittedFromVaultCount: 0, missingSourceDocumentIds: [],
  });
});
test('no submissions preserves the parent missing-documents warning', () => {
  assert.deepEqual(applicationDocumentHandoffProjection([expectation('a'), expectation('b')], []), {
    expectedCount: 2, submittedFromVaultCount: 0, missingSourceDocumentIds: ['a', 'b'],
  });
});
test('manual canonical re-read after submitting first document updates parent count', () => {
  const expected = [expectation('a'), expectation('b')];
  assert.deepEqual(applicationDocumentHandoffProjection(expected, [attachment('a')]), {
    expectedCount: 2, submittedFromVaultCount: 1, missingSourceDocumentIds: ['b'],
  });
  assert.deepEqual(applicationDocumentHandoffProjection(expected, [attachment('a'), attachment('b')]), {
    expectedCount: 2, submittedFromVaultCount: 2, missingSourceDocumentIds: [],
  });
});
test('duplicate expectation/attachment rows never inflate counts', () => {
  assert.deepEqual(applicationDocumentHandoffProjection(
    [expectation('a'), expectation('a'), expectation('b')],
    [attachment('a'), attachment('a')],
  ), { expectedCount: 2, submittedFromVaultCount: 1, missingSourceDocumentIds: ['b'] });
});
test('null linked source IDs are not evidence of handoff without matching copy destination', () => {
  assert.deepEqual(applicationDocumentHandoffProjection([expectation('a')], [attachment(null,'other/path')]), {
    expectedCount: 1, submittedFromVaultCount: 0, missingSourceDocumentIds: ['a'],
  });
});
test('unrelated submissions do not confirm another expected source ID', () => {
  assert.deepEqual(applicationDocumentHandoffProjection([expectation('a')], [attachment('elsewhere')]), {
    expectedCount: 1, submittedFromVaultCount: 0, missingSourceDocumentIds: ['a'],
  });
});
test('malformed expectation fails closed rather than falsely confirming handoff', () => {
  for (const row of [null, {}, expectation(''), expectation('   '), expectation(5)]) {
    assert.throws(() => applicationDocumentHandoffProjection([row], []), /応募書類の状態を確認できませんでした/);
  }
});
test('malformed attachment fails closed rather than publishing misleading counts', () => {
  for (const row of [null, {}, attachment(''), attachment(2)]) {
    assert.throws(() => applicationDocumentHandoffProjection([expectation('a')], [row]), /応募書類の状態を確認できませんでした/);
  }
});
test('non-array RPC snapshots are rejected, never interpreted as empty', () => {
  for (const e of [undefined, null, {}]) assert.throws(() => applicationDocumentHandoffProjection(e, []));
  for (const s of [undefined, null, {}]) assert.throws(() => applicationDocumentHandoffProjection([], s));
});
test('projection preserves canonical input arrays and ordering', () => {
  const expected = Object.freeze([Object.freeze(expectation('b')), Object.freeze(expectation('a')), Object.freeze(expectation('b'))]);
  const sent = Object.freeze([Object.freeze(attachment('a'))]);
  assert.deepEqual(applicationDocumentHandoffProjection(expected, sent).missingSourceDocumentIds, ['b']);
  assert.equal(expected.length, 3);
});
