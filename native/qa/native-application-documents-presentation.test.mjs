import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectApplicationDocuments, hasCanonicalApplicationAttachment } from '../src/lib/applicationDocumentsPresentation.ts';
const aid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const saved = [{ id: 'source-A', document_type: 'resume', title: '履歴書', is_default: true }, { id: 'source-B', document_type: 'nursery_teacher_license', title: '保育士証', is_default: false }];
const attachment = (source, type = 'resume', application_id = aid) => ({ id: 'copy-'+source, application_id, source_jobseeker_document_id: source, document_type: type, title: type, file_path: 'facility/path/'+source });
const expectation = (id, type, destination) => ({ source_jobseeker_document_id_snapshot: id, document_type: type, destination_file_path: destination });

test('already-submitted document remains disabled based on source id, not title', () => {
  const snapshot = projectApplicationDocuments(aid, saved, [attachment('source-A')], []);
  assert.equal(snapshot.attachedIds.has('source-A'), true);
  assert.equal(snapshot.attachedIds.has('source-B'), false);
});
test('Web-compatible missing expected documents and repairable sources', () => {
  const state = projectApplicationDocuments(aid, saved, [attachment('source-A')], [expectation('source-A','resume','facility/path/source-A'), expectation('source-B','nursery_teacher_license','expected/B'), expectation('deleted', 'cook_license', 'expected/deleted')]);
  assert.equal(state.missing.length, 2);
  assert.deepEqual(state.repairable.map(v=>v.id), ['source-B']);
  assert.equal(state.unavailableMissingCount, 1);
});
test('deleted source is not a missing warning when matching submitted type still exists', () => {
  const state = projectApplicationDocuments(aid, [], [attachment('former','resume')], [expectation('deleted','resume','previous-destination')]);
  assert.equal(state.missing.length, 0);
});
test('reject cross-application submitted rows (fail closed)', () => {
  assert.throws(() => projectApplicationDocuments(aid, saved, [attachment('source-A','resume','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')], []), /応募先/);
});
test('canonical readback needs exact candidate source, application and registered file', () => {
  assert.equal(hasCanonicalApplicationAttachment(aid,'source-A',[attachment('source-A')]), true);
  assert.equal(hasCanonicalApplicationAttachment(aid,'source-B',[attachment('source-A')]), false);
  assert.equal(hasCanonicalApplicationAttachment('wrong','source-A',[attachment('source-A')]), false);
  assert.equal(hasCanonicalApplicationAttachment(aid,'source-A',[{...attachment('source-A'),file_path:''}]), false);
});
test('a source id with a different title cannot be falsely confirmed', () => {
  assert.equal(hasCanonicalApplicationAttachment(aid,'unknown',[attachment('source-A')]), false);
});
