import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateApplyDocumentSubmissionPreflight as check } from '../src/lib/applyDocumentSubmissionPreflight.ts';

const requirements = { configured: true, items: [
  { document_type: 'resume', requirement: 'required', note: '原本確認' },
  { document_type: 'nursery_teacher_license', requirement: 'optional', note: null },
] };
const resume = { id: 'resume-A', document_type: 'resume' };
const license = { id: 'license-B', document_type: 'nursery_teacher_license' };
const rows = [
  { type: 'resume', level: 'required', candidates: [resume] },
  { type: 'nursery_teacher_license', level: 'optional', candidates: [license] },
];
const selected = { resume: 'resume-A', nursery_teacher_license: 'license-B' };

test('valid fresh documents, even reordered requirements, permit submission', () => {
  assert.equal(check(requirements, { ...requirements, items: [...requirements.items].reverse() }, rows, selected, [resume, license]), 'ready');
});
test('new required rows, changed requirements, note or configured flag require review', () => {
  const variants = [
    { ...requirements, configured: false },
    { ...requirements, items: [...requirements.items, { document_type: 'work_history', requirement: 'required', note: null }] },
    { ...requirements, items: requirements.items.map(x => x.document_type === 'resume' ? { ...x, requirement: 'optional' } : x) },
    { ...requirements, items: requirements.items.map(x => x.document_type === 'resume' ? { ...x, note: 'updated' } : x) },
  ];
  for (const value of variants) assert.equal(check(requirements, value, rows, selected, [resume, license]), 'requirements_changed');
});
test('deleted, reclassified or invisible selected documents cannot be submitted', () => {
  assert.equal(check(requirements, requirements, rows, selected, [license]), 'document_changed');
  assert.equal(check(requirements, requirements, rows, selected, [resume, { ...license, document_type: 'resume' }]), 'document_changed');
  assert.equal(check(requirements, requirements, rows, { ...selected, resume: 'unknown' }, [resume, license]), 'document_changed');
});
test('missing required selection fails closed', () => {
  assert.equal(check(requirements, requirements, rows, { ...selected, resume: null }, [resume, license]), 'document_changed');
});
test('unrelated document addition and optional deselection preserve intentional choices', () => {
  assert.equal(check(requirements, requirements, rows, { resume: 'resume-A', nursery_teacher_license: null }, [resume, { id: 'other', document_type: 'other' }]), 'ready');
  assert.deepEqual(selected, { resume: 'resume-A', nursery_teacher_license: 'license-B' });
});
test('an unconfigured job with no documents still permits the original no-attachment flow', () => {
  assert.equal(check({ configured: false, items: [] }, { configured: false, items: [] }, [], {}, []), 'ready');
});
