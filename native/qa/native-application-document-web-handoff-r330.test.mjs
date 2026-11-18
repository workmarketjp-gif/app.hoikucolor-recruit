import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationDocumentHandoffProjection } from '../src/lib/applicationDocumentHandoffProjection.ts';
import { projectApplicationDocuments } from '../src/lib/applicationDocumentsPresentation.ts';

const app = 'synthetic-app-A';
const expected = (id, documentType = 'resume') => ({
  application_id: app, source_jobseeker_document_id_snapshot: id,
  destination_file_path: 'application-copy/' + id, document_type: documentType,
});
const saved = (id) => ({ id, jobseeker_clerk_user_id: 'candidate-synthetic', document_type: 'resume', title: '合成書類', is_default: true });
const submitted = (sourceId, filePath, type = 'resume') => ({
  id: 'synth-attached-' + filePath, application_id: app,
  source_jobseeker_document_id: sourceId, file_path: filePath,
  document_type: type, title: '合成書類',
});
function assertWebParity(expectations, submittedRows, savedRows) {
  const child = projectApplicationDocuments(app, savedRows, submittedRows, expectations);
  const parent = applicationDocumentHandoffProjection(expectations, submittedRows, savedRows);
  assert.deepEqual(parent.missingSourceDocumentIds,
    child.missing.map((item) => item.source_jobseeker_document_id_snapshot));
  assert.equal(parent.submittedFromVaultCount, parent.expectedCount - child.missing.length);
  return parent;
}

test('canonical copy to expected destination clears both child and parent warning', () => {
  const expectation = expected('one');
  assert.deepEqual(assertWebParity([expectation], [submitted('one', expectation.destination_file_path)], [saved('one')]), {
    expectedCount: 1, submittedFromVaultCount: 1, missingSourceDocumentIds: [],
  });
});

test('matching source ID cannot falsely acknowledge an unrelated/empty destination', () => {
  const expectation = expected('one');
  assert.deepEqual(assertWebParity([expectation], [submitted('one', 'other-copy')], [saved('one')]).missingSourceDocumentIds, ['one']);
  assert.throws(() => applicationDocumentHandoffProjection([expectation], [submitted('one', '')]), /応募書類の状態/);
});

test('historical detached source with matching destination remains submitted', () => {
  const expectation = expected('deleted-vault-id');
  assertWebParity([expectation], [submitted(null, expectation.destination_file_path)], []);
  const result = applicationDocumentHandoffProjection([expectation], [submitted(null, expectation.destination_file_path)]);
  assert.equal(result.submittedFromVaultCount, 1);
});

test('legacy same-type copy counts only when a complete vault inventory proves source absent', () => {
  const expectation = expected('deleted-vault-id');
  const rows = [submitted(null, 'historical/old-copy')];
  assert.equal(assertWebParity([expectation], rows, []).submittedFromVaultCount, 1);
  // Initial two-source parent read must not invent the absent-vault evidence.
  assert.deepEqual(applicationDocumentHandoffProjection([expectation], rows).missingSourceDocumentIds, ['deleted-vault-id']);
  assert.equal(assertWebParity([expectation], rows, [saved('deleted-vault-id')]).submittedFromVaultCount, 0);
});

test('unrelated document type cannot satisfy missing expected document', () => {
  const expectation = expected('deleted-vault-id', 'qualification');
  assert.deepEqual(assertWebParity([expectation], [submitted(null, 'historical/resume')], []).missingSourceDocumentIds, ['deleted-vault-id']);
});

test('partial documents and duplicate expectation IDs preserve expected count and order', () => {
  const e1 = expected('one'), e2 = expected('two');
  const rows = [submitted('one', e1.destination_file_path)];
  const projection = applicationDocumentHandoffProjection([e1, e1, e2], rows, [saved('one'), saved('two')]);
  assert.deepEqual(projection, {expectedCount: 2, submittedFromVaultCount: 1, missingSourceDocumentIds: ['two']});
});

test('malformed canonical metadata does not become a successful document receipt', () => {
  const e = expected('one');
  for (const row of [null, {}, {...e, destination_file_path:''}, {...e, document_type:''}]) {
    assert.throws(() => applicationDocumentHandoffProjection([row], []), /応募書類の状態/);
  }
  for (const row of [null, {}, {...submitted('one','valid/path'), source_jobseeker_document_id:''}, {...submitted('one','valid/path'), document_type:''}]) {
    assert.throws(() => applicationDocumentHandoffProjection([e], [row]), /応募書類の状態/);
  }
  assert.throws(() => applicationDocumentHandoffProjection([e], [], [{id: ''}]), /応募書類の状態/);
});

test('canonical arrays are not mutated by projection', () => {
  const e = Object.freeze(expected('one'));
  const s = Object.freeze(submitted('one', e.destination_file_path));
  const v = Object.freeze(saved('one'));
  assert.equal(applicationDocumentHandoffProjection(Object.freeze([e]), Object.freeze([s]), Object.freeze([v])).submittedFromVaultCount, 1);
});
