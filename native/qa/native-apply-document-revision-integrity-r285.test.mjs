import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateApplyDocumentSubmissionPreflight as check, reviewApplyDocumentsBeforeSubmit } from '../src/lib/applyDocumentSubmissionPreflight.ts';

const requirements = { configured: true, items: [{ document_type: 'resume', requirement: 'required', note: null }] };
const selected = { resume: 'resume-A' };
const original = { id: 'resume-A', document_type: 'resume', file_path: 'synthetic-vault/a.pdf', updated_at: '2026-11-10T01:00:00Z' };
const rows = [{ type: 'resume', level: 'required', candidates: [original] }];

test('same ID and type with unchanged canonical file and revision are still eligible', () => {
  assert.equal(check(requirements, requirements, rows, selected, [original]), 'ready');
});
test('same ID and type with replaced canonical file must be reviewed again', () => {
  assert.equal(check(requirements, requirements, rows, selected, [{ ...original, file_path: 'synthetic-vault/replaced.pdf' }]), 'document_changed');
});
test('same ID and file path with changed metadata revision must be reviewed again', () => {
  assert.equal(check(requirements, requirements, rows, selected, [{ ...original, updated_at: '2026-11-11T01:00:00Z' }]), 'document_changed');
});
test('canonical omission of a previously displayed revision fingerprint fails closed', () => {
  assert.equal(check(requirements, requirements, rows, selected, [{ id: original.id, document_type: original.document_type }]), 'document_changed');
});
test('unrelated document updates do not invalidate a selected, unchanged revision', () => {
  assert.equal(check(requirements, requirements, rows, selected, [original, { ...original, id: 'unrelated', file_path: 'synthetic-vault/other.pdf' }]), 'ready');
});
test('asynchronous preflight blocks same-ID replacement after authoritative refresh', async () => {
  assert.equal(await reviewApplyDocumentsBeforeSubmit(requirements, rows, selected, async () => ({ requirements, documents: [{ ...original, file_path: 'synthetic-vault/replaced.pdf' }] }), () => true), 'document_changed');
});
