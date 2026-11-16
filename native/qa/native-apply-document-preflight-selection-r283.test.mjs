import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewApplyDocumentsBeforeSubmit } from '../src/lib/applyDocumentSubmissionPreflight.ts';

const requirements = { configured: true, items: [{ document_type: 'resume', requirement: 'required', note: null }] };
const document = { id: 'resume-1', document_type: 'resume' };
const rows = [{ type: 'resume', level: 'required', candidates: [document] }];
const selection = { resume: document.id };
const fresh = { requirements, documents: [document] };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

test('unmodified selection and current owner accept the fresh canonical read', async () => {
  assert.equal(await reviewApplyDocumentsBeforeSubmit(requirements, rows, selection, async () => fresh, () => true), 'ready');
});

test('an embedded vault refresh/upload invalidates the earlier selection while network read is pending', async () => {
  let revision = 4;
  const captured = revision;
  const work = deferred();
  const preflight = reviewApplyDocumentsBeforeSubmit(requirements, rows, selection, () => work.promise,
    () => revision === captured);
  revision++;
  work.resolve(fresh);
  assert.equal(await preflight, 'invalidated');
});

test('radio selection changed after preflight start cannot send the old document', async () => {
  let revision = 9;
  const initial = revision;
  const work = deferred();
  const preflight = reviewApplyDocumentsBeforeSubmit(requirements, rows, selection, () => work.promise,
    () => revision === initial);
  revision++;
  work.resolve(fresh);
  assert.equal(await preflight, 'invalidated');
});

test('account switch/blur prevents even starting the canonical read', async () => {
  let called = 0;
  const result = await reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    async () => { called++; return fresh; }, () => false);
  assert.equal(result, 'invalidated');
  assert.equal(called, 0);
});

test('fresh requirements and document deletion still fail closed in valid session', async () => {
  assert.equal(await reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    async () => ({ ...fresh, documents: [] }), () => true), 'document_changed');
  assert.equal(await reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    async () => ({ ...fresh, requirements: { configured: false, items: [] } }), () => true), 'requirements_changed');
});

test('a failed canonical read must propagate, not become a confirmed empty document list', async () => {
  await assert.rejects(() => reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    async () => { throw new Error('read failure'); }, () => true), /read failure/);
});
