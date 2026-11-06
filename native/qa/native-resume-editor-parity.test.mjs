import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RESUME_EDUCATION, MAX_RESUME_EMPLOYMENT, moveResumeEntry, canAppendResumeEntry,
  composeResumeYearMonth, resumeCurrentChange, educationStatusChange,
} from '../src/lib/resumeEditor.ts';

test('school and workplace ordering preserves row identity without mutating original', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveResumeEntry(rows, 1, -1).map(x => x.id), ['b', 'a', 'c']);
  assert.deepEqual(moveResumeEntry(rows, 1, 1).map(x => x.id), ['a', 'c', 'b']);
  assert.deepEqual(rows.map(x => x.id), ['a', 'b', 'c']);
});
test('out-of-bounds moves are harmless and keep identity', () => {
  const rows = ['a', 'b'];
  for (const [index, delta] of [[0, -1], [1, 1], [-1, 1], [2, -1]]) {
    assert.deepEqual(moveResumeEntry(rows, index, delta), rows);
  }
});
test('matches Web item limits without discarding existing entries', () => {
  assert.equal(MAX_RESUME_EDUCATION, 20);
  assert.equal(MAX_RESUME_EMPLOYMENT, 30);
  assert.equal(canAppendResumeEntry(Array(19), MAX_RESUME_EDUCATION), true);
  assert.equal(canAppendResumeEntry(Array(20), MAX_RESUME_EDUCATION), false);
  assert.equal(canAppendResumeEntry(Array(29), MAX_RESUME_EMPLOYMENT), true);
  assert.equal(canAppendResumeEntry(Array(30), MAX_RESUME_EMPLOYMENT), false);
});
test('year/month selection uses actual Web range and rejects malformed months', () => {
  assert.equal(composeResumeYearMonth('2020', '09', 2026), '2020-09');
  assert.equal(composeResumeYearMonth('1950', '01', 2026), '1950-01');
  assert.equal(composeResumeYearMonth('2032', '12', 2026), '2032-12');
  for (const [y,m] of [['1949','12'], ['2033','01'], ['2026','13'], ['2026','00'], ['2026','9'], ['20a6','01']]) {
    assert.equal(composeResumeYearMonth(y, m, 2026), null);
  }
});
test('current employment clears stale leaving date, never synthesizes a previous date', () => {
  const row = { is_current: false, end_ym: '2024-08', organization: '保育園' };
  const current = resumeCurrentChange(row, true);
  assert.equal(current.end_ym, null);
  assert.equal(current.is_current, true);
  assert.equal(resumeCurrentChange(current, false).end_ym, null);
  assert.equal(row.end_ym, '2024-08');
});
test('school education status synchronizes 在学中 and graduation date', () => {
  const row = { is_current: false, end_ym: '2025-03', education_status: '卒業' };
  const studying = educationStatusChange(row, '在学中');
  assert.deepEqual(studying, { is_current: true, end_ym: null, education_status: '在学中' });
  const graduated = educationStatusChange(studying, '卒業');
  assert.equal(graduated.is_current, false);
  assert.equal(graduated.end_ym, null);
  assert.equal(graduated.education_status, '卒業');
});
