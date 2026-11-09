import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcileApplyVaultSelection } from '../src/lib/applyVaultSelection.ts';

const resume = { id: 'resume-original', document_type: 'resume' };
const license = { id: 'license-original', document_type: 'nursery_teacher_license' };
const current = { resume: resume.id, nursery_teacher_license: license.id };

test('initial canonical vault load never auto-selects different existing file', () => {
  const next = [resume, license, { id: 'another-resume', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'loaded'), current);
});

test('explicit upload of one document into the opened type selects just that upload', () => {
  const next = [resume, license, { id: 'new-resume', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded'), {
    resume: 'new-resume', nursery_teacher_license: license.id,
  });
});

test('upload from a different type cannot change the user-selected file', () => {
  const next = [resume, license, { id: 'new-license', document_type: 'nursery_teacher_license' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded'), current);
});

test('two concurrent additions of the same type must require an explicit choice', () => {
  const next = [resume, license, { id: 'new-a', document_type: 'resume' }, { id: 'new-b', document_type: 'resume' }];
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, 'resume', 'uploaded'), current);
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
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], next, current, null, 'uploaded'), current);
  assert.deepEqual(reconcileApplyVaultSelection([resume, license], [resume, license], current, 'resume', 'uploaded'), current);
});

test('same document id cannot be silently treated as a new upload', () => {
  assert.deepEqual(reconcileApplyVaultSelection([resume], [resume], { resume: 'resume-original' }, 'resume', 'uploaded'), {
    resume: 'resume-original',
  });
});
