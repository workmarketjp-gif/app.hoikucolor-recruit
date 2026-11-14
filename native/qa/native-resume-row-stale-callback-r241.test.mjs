import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchResumeEntryById, moveResumeEntryById, canAppendResumeEntry,
  MAX_RESUME_EDUCATION, MAX_RESUME_EMPLOYMENT, educationStatusChange,
  resumeCurrentChange } from '../src/lib/resumeEditor.ts';

const schools = [
  { id: 'school-a', organization: 'テスト学園', department: null, end_ym: '2026-03', is_current: false, education_status: '卒業' },
  { id: 'school-b', organization: 'テスト短大', department: null, end_ym: '2027-03', is_current: false, education_status: '卒業見込み' },
];

test('two queued field edits preserve both latest values instead of overwriting an earlier edit', () => {
  let rows = schools;
  rows = patchResumeEntryById(rows, 'school-a', { organization: '新しい学校名' });
  rows = patchResumeEntryById(rows, 'school-a', { department: '保育学科' });
  assert.equal(rows[0].organization, '新しい学校名');
  assert.equal(rows[0].department, '保育学科');
  assert.equal(rows[1], schools[1]);
  assert.equal(schools[0].organization, 'テスト学園');
});

test('stale callback follows its own row after reordering, never the previous index', () => {
  const moved = moveResumeEntryById(schools, 'school-b', -1);
  const edited = patchResumeEntryById(moved, 'school-a', { organization: '正しい対象' });
  assert.deepEqual(edited.map(row => [row.id, row.organization]),
    [['school-b', 'テスト短大'], ['school-a', '正しい対象']]);
});

test('deleted, missing and duplicate IDs never edit another candidate row', () => {
  const deleted = schools.slice(1);
  assert.deepEqual(patchResumeEntryById(deleted, 'school-a', { organization: 'NG' }), deleted);
  assert.deepEqual(moveResumeEntryById(deleted, 'school-a', 1), deleted);
  assert.deepEqual(patchResumeEntryById(schools, '', { organization: 'NG' }), schools);
  const duplicates = [{ ...schools[0] }, { ...schools[0] }];
  assert.deepEqual(patchResumeEntryById(duplicates, 'school-a', { organization: 'NG' }), duplicates);
  assert.deepEqual(moveResumeEntryById(duplicates, 'school-a', 1), duplicates);
});

test('rapid age-group choices derive from the current row instead of a captured list', () => {
  let jobs = [{ id: 'job-a', age_groups: ['0歳児'], is_current: false, end_ym: '2024-03' }];
  for (const group of ['1歳児', '2歳児']) {
    jobs = patchResumeEntryById(jobs, 'job-a', current => ({
      age_groups: [...current.age_groups, group],
    }));
  }
  assert.deepEqual(jobs[0].age_groups, ['0歳児','1歳児','2歳児']);
});

test('status and current-employment rules act on latest row', () => {
  const schoolsNow = patchResumeEntryById(
    patchResumeEntryById(schools, 'school-a', { organization: '変更済み' }),
    'school-a', current => educationStatusChange(current, '在学中'));
  assert.equal(schoolsNow[0].organization, '変更済み');
  assert.equal(schoolsNow[0].end_ym, null);
  assert.equal(schoolsNow[0].is_current, true);
  let jobs = [{ id: 'job-a', is_current: false, end_ym: '2024-03', organization: '園A' }];
  jobs = patchResumeEntryById(jobs, 'job-a', { organization: '園B' });
  jobs = patchResumeEntryById(jobs, 'job-a', current => resumeCurrentChange(current, true));
  assert.deepEqual([jobs[0].organization,jobs[0].end_ym,jobs[0].is_current], ['園B',null,true]);
});

test('rapid additions respect current row count limits on the functional state', () => {
  let education = Array.from({length: MAX_RESUME_EDUCATION - 1}, (_,i) => ({id:'school-'+i}));
  for (const id of ['new-a','new-b']) {
    education = canAppendResumeEntry(education, MAX_RESUME_EDUCATION)
      ? [...education, {id}] : education;
  }
  assert.equal(education.length, MAX_RESUME_EDUCATION);
  assert.equal(education.at(-1).id, 'new-a');
  let employment = Array.from({length: MAX_RESUME_EMPLOYMENT - 1}, (_,i) => ({id:'job-'+i}));
  for (const id of ['new-a','new-b']) {
    employment = canAppendResumeEntry(employment, MAX_RESUME_EMPLOYMENT)
      ? [...employment, {id}] : employment;
  }
  assert.equal(employment.length, MAX_RESUME_EMPLOYMENT);
});
