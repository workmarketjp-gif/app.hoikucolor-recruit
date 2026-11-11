import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenCandidateVisit } from '../src/lib/candidateVisitEntry.ts';
import { presentSavedJobCard } from '../src/lib/savedJobCardPresentation.ts';

const now = Date.parse('2026-11-11T00:00:00Z');
const internal = { is_open: true, is_external: false, source_kind: 'hoiku_color',
  can_apply_direct: false, closing_at: null };
const saved = { ...internal, salary_min: null, salary_max: null,
  salary_note: null, salary_type: null, prefecture: null,
  city: null, employment_type: null };

test('an open internal job allows visit navigation even when direct application is disabled', () => {
  assert.equal(canOpenCandidateVisit(internal, now), true);
  const view = presentSavedJobCard(saved, now);
  assert.equal(view.directApply, false);
  assert.equal(view.canVisit, true);
});
test('internal, canonical v2 jobs without is_open remain visit-entry eligible', () => {
  assert.equal(canOpenCandidateVisit({ is_external: false, source_kind: 'hoiku_color',
    can_apply_direct: false, closing_at: null }, now), true);
});
test('external/imported postings cannot gain native visit entry regardless of apply flags', () => {
  for (const source_kind of ['hellowork', 'other', 'hoiku_color', undefined]) {
    assert.equal(canOpenCandidateVisit({ ...internal, is_external: true, source_kind,
      can_apply_direct: true }, now), false);
  }
});
test('closed or expired vacancies preserve historic read without opening new visit flows', () => {
  assert.equal(canOpenCandidateVisit({ ...internal, is_open: false }, now), false);
  assert.equal(canOpenCandidateVisit({ ...internal, closing_at: '2026-11-10T23:59:59Z' }, now), false);
  assert.equal(presentSavedJobCard({ ...saved, is_open: false }, now).canVisit, false);
  assert.equal(presentSavedJobCard({ ...saved, closing_at: '2026-11-10T23:59:59Z' }, now).canVisit, false);
});
test('unverified identity and malformed expiry fail closed', () => {
  for (const candidate of [null, undefined, {},
    { ...internal, is_external: undefined },
    { ...internal, is_open: undefined, source_kind: null },
    { ...internal, closing_at: '' },
    { ...internal, closing_at: 'not-a-date' }]) {
    assert.equal(canOpenCandidateVisit(candidate, now), false);
  }
  assert.equal(canOpenCandidateVisit(internal, Number.NaN), false);
});
test('deadline boundary is consistent with current Web expiration rule', () => {
  assert.equal(canOpenCandidateVisit({ ...internal, closing_at: '2026-11-11T00:00:00Z' }, now), true);
  assert.equal(canOpenCandidateVisit({ ...internal, closing_at: '2026-11-11T00:00:00Z' }, now + 1), false);
});
