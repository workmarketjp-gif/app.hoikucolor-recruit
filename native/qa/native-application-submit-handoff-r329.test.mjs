import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicationDocumentHandoffProjection } from '../src/lib/applicationDocumentHandoffProjection.ts';
import { hasCanonicalApplicationAttachment, projectApplicationDocuments } from '../src/lib/applicationDocumentsPresentation.ts';

const app = 'synthetic-app-A';
const saved = (id) => ({ id, document_type: 'resume', title: '合成履歴書', is_default: true });
const expected = (id) => ({ application_id: app, source_jobseeker_document_id_snapshot: id, destination_file_path: 'synthetic/' + id, document_type: 'resume' });
const submitted = (sourceId, id = 'synthetic-submitted-' + sourceId) => ({ id, application_id: app, source_jobseeker_document_id: sourceId, document_type: 'resume', title: '合成履歴書', file_path: 'synthetic/' + sourceId });

// Actual UI readback uses the canonical three-source snapshot rather than a
// second, independently timed two-source request to decide parent warning.
test('confirmed submit from one canonical snapshot closes both child and parent warnings', () => {
  const expectations = [expected('one')];
  const rows = [submitted('one')];
  const child = projectApplicationDocuments(app, [saved('one')], rows, expectations);
  const handoff = applicationDocumentHandoffProjection(expectations, rows);
  assert.equal(child.missing.length, 0);
  assert.equal(hasCanonicalApplicationAttachment(app, 'one', rows), true);
  assert.deepEqual(handoff, { expectedCount: 1, submittedFromVaultCount: 1, missingSourceDocumentIds: [] });
});

test('partial batch after a confirmed first write retains remaining parent warning', () => {
  const expectations = [expected('one'), expected('two')];
  const rows = [submitted('one')];
  const child = projectApplicationDocuments(app, [saved('one'), saved('two')], rows, expectations);
  const handoff = applicationDocumentHandoffProjection(expectations, rows);
  assert.equal(child.missing.length, 1);
  assert.deepEqual(handoff.missingSourceDocumentIds, ['two']);
  assert.equal(handoff.submittedFromVaultCount, 1);
  assert.equal(hasCanonicalApplicationAttachment(app, 'two', rows), false);
});

test('wrong application submission is rejected rather than clearing a parent warning', () => {
  const wrong = { ...submitted('one'), application_id: 'synthetic-app-B' };
  assert.throws(() => projectApplicationDocuments(app, [saved('one')], [wrong], [expected('one')]), /応募先/);
  assert.equal(hasCanonicalApplicationAttachment(app, 'one', [wrong]), false);
});

test('unconfirmed submission with empty file path is not counted as an acknowledgement', () => {
  const row = { ...submitted('one'), file_path: '' };
  assert.equal(hasCanonicalApplicationAttachment(app, 'one', [row]), false);
});

test('unexpected malformed expectation fails closed rather than publishing a parent success', () => {
  assert.throws(() => applicationDocumentHandoffProjection([{}], [submitted('one')]), /確認できません/);
});

test('duplicate canonical document copies do not inflate a parent receipt', () => {
  const expectations = [expected('one'), expected('one')];
  const rows = [submitted('one'), submitted('one', 'synthetic-copy-2')];
  const state = applicationDocumentHandoffProjection(expectations, rows);
  assert.deepEqual(state, { expectedCount: 1, submittedFromVaultCount: 1, missingSourceDocumentIds: [] });
});
