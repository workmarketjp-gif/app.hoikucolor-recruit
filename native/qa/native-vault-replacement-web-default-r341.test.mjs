import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmCandidateVaultReplacementPreserved } from '../src/lib/confirmCandidateVaultReplacement.ts';

const owner = 'synthetic-candidate-A';
const previous = Object.freeze({ id: 'old', jobseeker_clerk_user_id: owner, document_type: 'resume', file_path: `jobseekers/${owner}/old/document.pdf`, is_default: true });
const uploaded = Object.freeze({ id: 'new', jobseeker_clerk_user_id: owner, document_type: 'resume', file_path: `jobseekers/${owner}/new/document.pdf`, is_default: true });
const oldSaved = Object.freeze({ ...previous, is_default: false });
const defaults = { previous, uploaded, canonicalRows: [oldSaved, uploaded], ownerId: owner, isCurrent: () => true };
const run = (overrides = {}) => confirmCandidateVaultReplacementPreserved({ ...defaults, ...overrides });
const fail = (overrides) => assert.throws(() => run(overrides), /再読み込み/);

test('Web: keep old source, select new default, never delete old row', () => assert.deepEqual(run(), [oldSaved, uploaded]));
test('Web: other document types retain independent defaults', () => {
  const licence = { ...previous, id: 'licence', document_type: 'qualification', file_path: `jobseekers/${owner}/licence.png` };
  assert.deepEqual(run({ canonicalRows: [oldSaved, uploaded, licence] }), [oldSaved, uploaded, licence]);
});
test('reject previous row absent', () => fail({ canonicalRows: [uploaded] }));
test('reject newly uploaded row absent', () => fail({ canonicalRows: [oldSaved] }));
test('reject null or API/error-shaped readback as success', () => {
  fail({ canonicalRows: null }); fail({ canonicalRows: { data: [oldSaved, uploaded] } });
});
test('reject wrong owner on any row', () => fail({ canonicalRows: [oldSaved, { ...uploaded, jobseeker_clerk_user_id: 'synthetic-candidate-B' }] }));
test('reject caller owner different from candidate', () => fail({ ownerId: 'synthetic-candidate-B' }));
test('reject empty caller owner', () => fail({ ownerId: '' }));
test('reject same row id for old and new document', () => fail({ uploaded: { ...uploaded, id: previous.id } }));
test('reject duplicate canonical row ID', () => fail({ canonicalRows: [oldSaved, uploaded, uploaded] }));
test('reject changed previous file key', () => fail({ canonicalRows: [{ ...oldSaved, file_path: 'different' }, uploaded] }));
test('reject changed uploaded file key', () => fail({ canonicalRows: [oldSaved, { ...uploaded, file_path: 'different' }] }));
test('reject same private path used by old and uploaded', () => fail({ uploaded: { ...uploaded, file_path: previous.file_path } }));
test('reject changed original document type', () => fail({ canonicalRows: [{ ...oldSaved, document_type: 'other' }, uploaded] }));
test('reject changed newly uploaded document type', () => fail({ canonicalRows: [oldSaved, { ...uploaded, document_type: 'other' }] }));
test('reject default not transferred to newly uploaded row', () => fail({ canonicalRows: [previous, { ...uploaded, is_default: false }] }));
test('reject two simultaneous default rows of same type', () => fail({ canonicalRows: [previous, uploaded] }));
test('reject another same-type default row', () => {
  const other = { ...previous, id: 'another', file_path: `jobseekers/${owner}/another.pdf` };
  fail({ canonicalRows: [oldSaved, uploaded, other] });
});
test('reject mutation reply without default flag', () => fail({ uploaded: { ...uploaded, is_default: false } }));
test('reject replacement request for non-default old row (Web not offered)', () => fail({ previous: oldSaved }));
test('reject revoked session', () => fail({ isCurrent: () => false }));
test('reject session revoked after canonical checks', () => {
  let calls = 0; fail({ isCurrent: () => ++calls === 1 });
});
test('reject changed uploaded owner', () => fail({ uploaded: { ...uploaded, jobseeker_clerk_user_id: 'synthetic-candidate-B' } }));
