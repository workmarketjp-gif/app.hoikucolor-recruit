import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recordApplyVaultBusyTransition,
  reviewApplyDocumentsBeforeSubmit,
} from '../src/lib/applyDocumentSubmissionPreflight.ts';

const requirements = { configured: true, items: [{ document_type: 'resume', requirement: 'required', note: null }] };
const document = { id: 'synthetic-resume', document_type: 'resume', file_path: 'synthetic-only/resume.pdf', updated_at: '2026-11-10T01:00:00Z' };
const rows = [{ type: 'resume', level: 'required', candidates: [document] }];
const selection = { resume: document.id };
const fresh = { requirements, documents: [document] };
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

test('a synchronous vault operation start revokes a pending application preflight', async () => {
  const vaultBusy = { current: false };
  const revision = { current: 3 };
  const originalRevision = revision.current;
  const network = deferred();
  const pending = reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    () => network.promise, () => !vaultBusy.current && revision.current === originalRevision);
  recordApplyVaultBusyTransition(true, vaultBusy, revision);
  assert.equal(vaultBusy.current, true);
  assert.equal(revision.current, originalRevision + 1);
  network.resolve(fresh);
  assert.equal(await pending, 'invalidated');
});

test('a started vault operation blocks a submission before the first API read', async () => {
  const vaultBusy = { current: false };
  const revision = { current: 1 };
  recordApplyVaultBusyTransition(true, vaultBusy, revision);
  let calls = 0;
  assert.equal(await reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    async () => { calls++; return fresh; }, () => !vaultBusy.current), 'invalidated');
  assert.equal(calls, 0);
});

test('ending a vault operation never restores the old in-flight preflight', async () => {
  const vaultBusy = { current: false };
  const revision = { current: 8 };
  const checkedAt = revision.current;
  const network = deferred();
  const pending = reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    () => network.promise, () => !vaultBusy.current && revision.current === checkedAt);
  recordApplyVaultBusyTransition(true, vaultBusy, revision);
  recordApplyVaultBusyTransition(false, vaultBusy, revision);
  assert.equal(vaultBusy.current, false);
  network.resolve(fresh);
  assert.equal(await pending, 'invalidated');
});

test('repeated busy notifications do not advance the revision more than one per operation', () => {
  const vaultBusy = { current: false };
  const revision = { current: 0 };
  recordApplyVaultBusyTransition(true, vaultBusy, revision);
  recordApplyVaultBusyTransition(true, vaultBusy, revision);
  assert.equal(revision.current, 1);
  recordApplyVaultBusyTransition(false, vaultBusy, revision);
  recordApplyVaultBusyTransition(true, vaultBusy, revision);
  assert.equal(revision.current, 2);
});

test('a stable idle vault still permits the valid canonical document selection', async () => {
  const vaultBusy = { current: false };
  const revision = { current: 0 };
  recordApplyVaultBusyTransition(false, vaultBusy, revision);
  assert.equal(await reviewApplyDocumentsBeforeSubmit(requirements, rows, selection,
    async () => fresh, () => !vaultBusy.current && revision.current === 0), 'ready');
});
