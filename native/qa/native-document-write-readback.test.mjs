import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmCandidateDocumentWrite } from '../src/lib/documentWriteReadback.ts';

const doc = { id: 'doc-1', jobseeker_clerk_user_id: 'user-A', document_type: 'resume', file_path: 'jobseekers/user-A/doc-1/document.pdf' };
const message = '書類の登録結果を確認できませんでした。書類一覧を再読み込みしてください。';
const mismatch = '保存された書類の所有者・保存先が一致しません。';
function caseOf(override = {}) {
  const events = [];
  return { events, options: {
    register: async () => { events.push('register'); return doc; },
    readback: async () => { events.push('readback'); return doc; },
    matches: (row) => row.id === doc.id && row.jobseeker_clerk_user_id === doc.jobseeker_clerk_user_id && row.file_path === doc.file_path,
    uncertainMessage: message,
    mismatchMessage: mismatch,
    ...override,
  } };
}
test('confirmed document registration succeeds only after independent canonical readback', async () => {
  const f = caseOf();
  assert.equal(await confirmCandidateDocumentWrite(f.options), doc);
  assert.deepEqual(f.events, ['register', 'readback']);
});
test('timeout after server commit recovers by ID without replaying registration', async () => {
  const f = caseOf({ register: async () => { f.events.push('register'); throw new Error('timeout after commit'); } });
  assert.equal(await confirmCandidateDocumentWrite(f.options), doc);
  assert.deepEqual(f.events, ['register', 'readback']);
});
test('RPC returned null and confirmed database row is accepted', async () => {
  const f = caseOf({ register: async () => null });
  assert.equal(await confirmCandidateDocumentWrite(f.options), doc);
});
test('unconfirmed registration with null readback never claims success', async () => {
  const f = caseOf({ register: async () => null, readback: async () => null });
  await assert.rejects(confirmCandidateDocumentWrite(f.options), /保存先|登録結果を確認/);
});
test('network failure during readback remains uncertain, not rolled back', async () => {
  const f = caseOf({ readback: async () => { throw new Error('offline'); } });
  await assert.rejects(confirmCandidateDocumentWrite(f.options), { message });
});
test('wrong owner, path or document identity is rejected after successful RPC', async () => {
  for (const changed of [{ jobseeker_clerk_user_id: 'user-B' }, { file_path: 'other' }, { id: 'doc-2' }]) {
    const f = caseOf({ readback: async () => ({ ...doc, ...changed }) });
    await assert.rejects(confirmCandidateDocumentWrite(f.options), { message: mismatch });
  }
});
test('no cleanup or retry callback is accepted or invoked in ambiguous handler', async () => {
  let calls = 0;
  const f = caseOf({ register: async () => { calls++; throw new Error('timeout'); }, readback: async () => null });
  await assert.rejects(confirmCandidateDocumentWrite(f.options), { message });
  assert.equal(calls, 1);
  assert.equal(Object.hasOwn(f.options, 'cleanup'), false);
});
