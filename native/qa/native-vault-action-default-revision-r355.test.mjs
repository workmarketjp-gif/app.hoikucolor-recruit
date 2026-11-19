import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canActOnCandidateDocument,
  assertCandidateDocumentListOwner,
} from '../src/lib/documentVaultPrivacy.ts';

// Synthetic rows only. These checks complement server-side RLS, not replace it.
const owner = 'synthetic-candidate-A';
const key = 'synthetic-session-A';
const first = {
  id: 'synthetic-resume-1', jobseeker_clerk_user_id: owner,
  file_path: 'synthetic-candidate-A/resume-1.pdf', document_type: 'resume', is_default: true,
};
const second = {
  id: 'synthetic-resume-2', jobseeker_clerk_user_id: owner,
  file_path: 'synthetic-candidate-A/resume-2.pdf', document_type: 'resume', is_default: false,
};
const license = {
  id: 'synthetic-license', jobseeker_clerk_user_id: owner,
  file_path: 'synthetic-candidate-A/license.pdf', document_type: 'nursery_teacher_license', is_default: true,
};
const canAct = (displayed, rows) =>
  canActOnCandidateDocument(displayed, rows, owner, key, key, true);

test('unchanged canonical default and nondefault rows remain actionable', () => {
  assert.equal(canAct(first, [first, second, license]), true);
  assert.equal(canAct(second, [first, second, license]), true);
});
test('a newly defaulted document is not the old displayed nondefault action', () => {
  assert.equal(canAct(second, [{ ...first, is_default: false }, { ...second, is_default: true }]), false);
});
test('a removed default cannot still authorize the stale displayed replace action', () => {
  assert.equal(canAct(first, [{ ...first, is_default: false }, { ...second, is_default: true }]), false);
});
test('two canonical defaults of the same type invalidate action, even for an exact row', () => {
  assert.equal(canAct(first, [first, { ...second, is_default: true }]), false);
});
test('defaults for distinct document types are valid', () => {
  assert.equal(canAct(first, [first, second, license]), true);
});
test('canonical whitespace-only id or path cannot be treated as a private document', () => {
  assert.throws(() => assertCandidateDocumentListOwner([{ ...first, id: '   ' }], owner));
  assert.throws(() => assertCandidateDocumentListOwner([{ ...first, file_path: '   ' }], owner));
});
test('canonical blank document type cannot be used to authorize actions', () => {
  assert.equal(canAct(first, [first, { ...second, document_type: '  ' }]), false);
});
