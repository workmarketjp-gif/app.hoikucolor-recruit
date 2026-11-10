import assert from 'node:assert/strict';
import test from 'node:test';
import { formatApplicationVisitDuration } from '../src/lib/applicationEventPresentation.ts';

test('application visit duration matches approved Web for short and exact-hour sessions', () => {
  assert.equal(formatApplicationVisitDuration('2026-11-11T01:00:00Z', '2026-11-11T01:45:00Z'), '45分');
  assert.equal(formatApplicationVisitDuration('2026-11-11T01:00:00Z', '2026-11-11T03:00:00Z'), '2時間');
});

test('application visit duration matches approved Web for multi-hour and rounded sessions', () => {
  assert.equal(formatApplicationVisitDuration('2026-11-11T01:00:00Z', '2026-11-11T03:30:00Z'), '2時間30分');
  assert.equal(formatApplicationVisitDuration('2026-11-11T01:00:00Z', '2026-11-11T01:00:35Z'), '1分');
});

test('application visit duration never invents a positive duration for missing or invalid timestamps', () => {
  for (const [start, end] of [['invalid','2026-11-11T02:00:00Z'], ['2026-11-11T02:00:00Z','invalid'],['2026-11-11T02:00:00Z','2026-11-11T02:00:00Z'],['2026-11-11T02:00:00Z','2026-11-11T01:00:00Z']]) {
    assert.equal(formatApplicationVisitDuration(start, end), '');
  }
});

test('application visit duration uses absolute timestamps across Japan-local midnight', () => {
  assert.equal(formatApplicationVisitDuration('2026-11-10T14:50:00Z', '2026-11-10T15:10:00Z'), '20分');
});
