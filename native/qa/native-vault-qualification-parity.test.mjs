import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qualificationEvidenceCounts } from '../src/lib/qualificationEvidenceCounts.ts';

const stored = [
  { document_type: 'nursery_teacher_license' },
  { document_type: 'nursery_teacher_license' },
  { document_type: 'nurse_license' },
  { document_type: 'resume' },
];
test('two stored licence copies count as stored, not as verified qualifications', () => {
  assert.deepEqual(qualificationEvidenceCounts(['nursery_teacher_license'], stored), [
    { type: 'nursery_teacher_license', savedCount: 2 },
  ]);
});
test('evidence types are kept distinct, including nurse versus assistant nurse', () => {
  assert.deepEqual(qualificationEvidenceCounts(['nurse_license', 'assistant_nurse_license'], stored), [
    { type: 'nurse_license', savedCount: 1 },
    { type: 'assistant_nurse_license', savedCount: 0 },
  ]);
});
test('no mapped evidence type never implies qualification verification', () => {
  assert.deepEqual(qualificationEvidenceCounts([], stored), []);
});
test('empty but authoritatively loaded vault reports no saved files', () => {
  assert.deepEqual(qualificationEvidenceCounts(['dietitian_license'], []), [
    { type: 'dietitian_license', savedCount: 0 },
  ]);
});
test('saved counts do not conflate non-licence document types', () => {
  assert.deepEqual(qualificationEvidenceCounts(['nursery_teacher_license'], [{ document_type: 'resume' }]), [
    { type: 'nursery_teacher_license', savedCount: 0 },
  ]);
});
