import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESUME_AUTOSAVE_DELAY_MS,
  shouldConfirmResumeReload,
  shouldScheduleResumeAutosave,
} from '../src/lib/resumeAutosavePolicy.ts';

const allowed = {
  ownerKey: 'user-A:session-1', loadedOwner: 'user-A:session-1', privateAllowed: true,
  loading: false, dirty: true, saving: false, pausedAfterError: false,
};

test('same-session unsaved edit qualifies for Web-equivalent 1200ms debounce', () => {
  assert.equal(RESUME_AUTOSAVE_DELAY_MS, 1200);
  assert.equal(shouldScheduleResumeAutosave(allowed), true);
});
test('new session, missing session, and different candidate must never auto-save old draft', () => {
  for (const patch of [
    { ownerKey: null }, { loadedOwner: null }, { ownerKey: 'user-A:session-2' },
    { ownerKey: 'user-B:session-1' },
  ]) assert.equal(shouldScheduleResumeAutosave({ ...allowed, ...patch }), false);
});
test('App Lock and private-data quarantine suppress timer', () => {
  assert.equal(shouldScheduleResumeAutosave({ ...allowed, privateAllowed: false }), false);
});
test('read in progress, clean records and active writes cannot start a second save', () => {
  for (const patch of [{ loading: true }, { dirty: false }, { saving: true }]) {
    assert.equal(shouldScheduleResumeAutosave({ ...allowed, ...patch }), false);
  }
});
test('unknown mutation result pauses all background retries', () => {
  assert.equal(shouldScheduleResumeAutosave({ ...allowed, pausedAfterError: true }), false);
  assert.equal(shouldScheduleResumeAutosave({ ...allowed, pausedAfterError: true, dirty: true }), false);
});
test('canonical reload requires explicit consent to discard unsaved form', () => {
  assert.equal(shouldConfirmResumeReload(true), true);
  assert.equal(shouldConfirmResumeReload(false), false);
});
