import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSavedJobReadback } from '../src/lib/confirmedSavedIds.ts';

test('a newly saved job must be present in the canonical readback', () => {
  assert.deepEqual(assertSavedJobReadback('owned', true, ['owned', 'other']), ['owned', 'other']);
});
test('an unsaved job must be absent from the canonical readback', () => {
  assert.deepEqual(assertSavedJobReadback('owned', false, ['other']), ['other']);
});
test('a stale save response is not a confirmed success', () => {
  assert.throws(() => assertSavedJobReadback('owned', true, ['other']), /SAVED_JOB_READBACK_MISMATCH/);
});
test('a stale unsave response is not a confirmed success', () => {
  assert.throws(() => assertSavedJobReadback('owned', false, ['owned']), /SAVED_JOB_READBACK_MISMATCH/);
});
test('an empty authoritative list is valid only when removal is confirmed', () => {
  assert.deepEqual(assertSavedJobReadback('owned', false, []), []);
});
