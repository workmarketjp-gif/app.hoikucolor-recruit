import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileApplyVaultSelection, isApplySubmissionUnavailable } from '../src/lib/applyVaultSelection.ts';

const resume = { id: 'resume-original', document_type: 'resume' };
const license = { id: 'license-original', document_type: 'nursery_teacher_license' };
const current = { resume: resume.id, nursery_teacher_license: license.id };

test('initial canonical vault load never auto-selects different existing file', () => {
  const next = [resume, license, { id: 'another-resume', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'loaded'), current);
});

test('explicit upload of one document into the opened type selects just that upload', () => {
  const next = [resume, license, { id: 'new-resume', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded', 'new-resume'), {
    resume: 'new-resume', nursery_teacher_license: license.id,
  });
});

test('upload from a different type cannot change the user-selected file', () => {
  const next = [resume, license, { id: 'new-license', document_type: 'nursery_teacher_license' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded', 'new-license'), current);
});

test('two concurrent additions of the same type must require an explicit choice', () => {
  const next = [resume, license, { id: 'new-a', document_type: 'resume' }, { id: 'new-b', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded', null), current);
});

test('deleted selected documents are cleared, and other choices stay untouched', () => {
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], [license], current, 'resume', 'loaded'), {
    resume: null, nursery_teacher_license: license.id,
  });
});

test('empty canonical vault clears selections without choosing other documents', () => {
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], [], current, 'resume', 'loaded'), {
    resume: null, nursery_teacher_license: null,
  });
});

test('missing addingType or no verified new file cannot trigger implicit attachment', () => {
  const next = [resume, license, { id: 'new-resume', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, null, 'uploaded', 'new-resume'), current);
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], [resume, license], current, 'resume', 'uploaded', 'new-resume'), current);
});

test('same document id cannot be silently treated as a new upload', () => {
  assert.deepEqual(reconcileApplyVaultSelection([resume], [resume], { resume: 'resume-original' }, 'resume', 'uploaded', 'resume-original'), {
    resume: 'resume-original',
  });
});

// The upload-completion event must carry the actual confirmed saved ID.
// A list diff cannot prove which of several concurrent additions was uploaded here.
test('concurrent same-type addition selects only the explicitly confirmed uploaded ID', () => {
  const next = [resume, license, { id: 'other-device', document_type: 'resume' }, { id: 'our-upload', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded', 'our-upload'), {
    resume: 'our-upload', nursery_teacher_license: license.id,
  });
});

test('an upload event without an explicit saved ID never selects another file', () => {
  const next = [resume, license, { id: 'other-device', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded'), current);
});

test('wrong-type and unknown uploaded IDs cannot change selected attachments', () => {
  const next = [resume, license, { id: 'new-license', document_type: 'nursery_teacher_license' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded', 'new-license'), current);
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded', 'unknown'), current);
});


test('application stays blocked while the embedded document picker or upload is active', () => {
  const base = { requirementsReady: true, submitting: false, vaultRefreshing: false, vaultBusy: false };
  assert.equal(isApplySubmissionUnavailable(base), false);
  assert.equal(isApplySubmissionUnavailable({ ...base, vaultBusy: true }), true);
  assert.equal(isApplySubmissionUnavailable({ ...base, vaultRefreshing: true }), true);
  assert.equal(isApplySubmissionUnavailable({ ...base, submitting: true }), true);
  assert.equal(isApplySubmissionUnavailable({ ...base, requirementsReady: false }), true);
});
