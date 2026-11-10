import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyVaultReadbackState,
  isApplySubmissionUnavailable,
  reconcileApplyVaultSelection,
} from '../src/lib/applyVaultSelection.ts';

function cannotSubmit(readback) {
  return isApplySubmissionUnavailable({
    requirementsReady: true,
    submitting: false,
    vaultBusy: false,
    vaultRefreshing: readback !== 'ready',
  });
}

test('loading never turns a temporary empty list into an actionable application', () => {
  const state = applyVaultReadbackState('loading');
  assert.equal(state, 'loading');
  assert.equal(cannotSubmit(state), true);
});

test('a canonical vault read failure remains fail-closed rather than appearing as an empty list', () => {
  const state = applyVaultReadbackState('error');
  assert.equal(state, 'failed');
  assert.equal(cannotSubmit(state), true);
});

test('retry remains blocked until an authoritative successful readback', () => {
  let state = applyVaultReadbackState('error');
  assert.equal(cannotSubmit(state), true);
  state = applyVaultReadbackState('loading');
  assert.equal(cannotSubmit(state), true);
  state = applyVaultReadbackState('loaded');
  assert.equal(state, 'ready');
  assert.equal(cannotSubmit(state), false);
});

test('a verified upload can resume the application without implicitly changing other file choices', () => {
  const selected = { resume: 'chosen-resume', nursery_teacher_license: 'chosen-license' };
  const prior = [
    { id: 'chosen-resume', document_type: 'resume' },
    { id: 'chosen-license', document_type: 'nursery_teacher_license' },
  ];
  const after = [ ...prior, { id: 'fresh-resume', document_type: 'resume' } ];
  assert.equal(applyVaultReadbackState('uploaded'), 'ready');
  assert.equal(cannotSubmit(applyVaultReadbackState('uploaded')), false);
  assert.deepEqual(reconcileApplyVaultSelection(prior, after, selected, 'resume', 'uploaded', 'fresh-resume'), {
    resume: 'fresh-resume', nursery_teacher_license: 'chosen-license',
  });
});

test('failed readback does not require a fabricated document ID to recover', () => {
  assert.equal(applyVaultReadbackState('error'), 'failed');
  assert.equal(applyVaultReadbackState('loading'), 'loading');
  assert.equal(applyVaultReadbackState('loaded'), 'ready');
});
