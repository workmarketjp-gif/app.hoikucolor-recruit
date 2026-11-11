import test from 'node:test';
import assert from 'node:assert/strict';
import { savedJobNavigationPath } from '../src/lib/savedJobNavigation.ts';

const id = '123e4567-e89b-42d3-a456-426614174000';
const now = Date.parse('2026-11-12T00:00:00Z');
const job = {
  is_open: true, closing_at: null, is_external: false, can_apply_direct: true,
  salary_min: 200000, salary_max: 240000, salary_type: 'monthly', salary_note: null,
  prefecture: '東京都', city: '品川区', employment_type: '正社員',
  verified_workplace: null, verified_finance: null,
};
const path = (override = {}, destination = 'apply', date = now) =>
  savedJobNavigationPath(id, { ...job, ...override }, destination, date);

test('saved Web 応募する enters the existing guarded Native document flow, not an RPC', () => {
  assert.equal(path(), `/job/${id}?apply=1`);
  assert.equal(path({}, 'detail'), `/job/${id}`);
  assert.equal(path({}, 'visit'), `/visits?jobId=${id}`);
});
test('never advertises a direct application for closed, expired, external or disabled jobs', () => {
  assert.equal(path({ is_open: false }), null);
  assert.equal(path({ closing_at: '2026-11-11T23:59:59Z' }), null);
  assert.equal(path({ is_external: true }), null);
  assert.equal(path({ can_apply_direct: false }), null);
});
test('visit is independent of direct application and requires an internal active posting', () => {
  assert.equal(path({ can_apply_direct: false }, 'visit'), `/visits?jobId=${id}`);
  assert.equal(path({ is_external: true }, 'visit'), null);
  assert.equal(path({ is_open: false }, 'visit'), null);
});
test('expired and external saved jobs remain readable in their detail view', () => {
  assert.equal(path({ is_open: false }, 'detail'), `/job/${id}`);
  assert.equal(path({ is_external: true }, 'detail'), `/job/${id}`);
});
test('invalid ID and clock do not create deep links', () => {
  assert.equal(savedJobNavigationPath('other', job, 'apply', now), null);
  assert.equal(savedJobNavigationPath(id, job, 'apply', Number.NaN), null);
});
