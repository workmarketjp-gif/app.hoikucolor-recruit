import assert from 'node:assert/strict';
import test from 'node:test';
import { specifiedJobIdFromRoute, specifiedJobIdToRead, presentSpecifiedJobPage } from '../src/lib/jobSearchSpecifiedEntry.ts';

const a = 'A1a11111-1111-4111-8111-111111111111';
const b = 'b2b22222-2222-4222-8222-222222222222';
const c = 'c3c33333-3333-4333-8333-333333333333';
const jobs = [{ id: b, title: 'B' }, { id: a.toLowerCase(), title: 'A search result' }];

test('Web-compatible UUID validation; no raw route query is trusted', () => {
  assert.equal(specifiedJobIdFromRoute(a), a.toLowerCase());
  assert.equal(specifiedJobIdFromRoute([a, b]), a.toLowerCase());
  for (const v of [undefined, '', 'a', '../jobs', 'not-a-job', '11111111-1111-1111-1111-111111111111'])
    assert.equal(specifiedJobIdFromRoute(v), null);
});

test('only an initial unfiltered empty-keyword search requests the canonical specified job', () => {
  const base = { jobId: a.toLowerCase(), reset: true, keyword: '', hasFilters: false };
  assert.equal(specifiedJobIdToRead(base), a.toLowerCase());
  assert.equal(specifiedJobIdToRead({ ...base, keyword: '園' }), null);
  assert.equal(specifiedJobIdToRead({ ...base, hasFilters: true }), null);
  assert.equal(specifiedJobIdToRead({ ...base, reset: false }), null);
  assert.equal(specifiedJobIdToRead({ ...base, keyword: '  ' }), a.toLowerCase());
});

test('canonical job pinned exactly once and organic result order preserved', () => {
  const canonical = { id: a.toLowerCase(), title: 'A canonical' };
  const r = presentSpecifiedJobPage(jobs, a.toLowerCase(), canonical);
  assert.deepEqual(r.jobs, [canonical, jobs[0]]);
  assert.equal(r.specifiedJobId, a.toLowerCase());
  assert.equal(r.notice, null);
  assert.equal(jobs.length, 2); // no mutation
});

test('specified canonical row not in first search page is presented without invented rank', () => {
  const canonical = { id: c, title: 'C canonical' };
  const r = presentSpecifiedJobPage(jobs, c, canonical);
  assert.deepEqual(r.jobs, [canonical, ...jobs]);
  assert.equal(r.specifiedJobId, c);
});

test('missing, mismatched and absent hints never expose an unverified target row', () => {
  const missing = presentSpecifiedJobPage(jobs, c, null);
  assert.deepEqual(missing.jobs, jobs);
  assert.equal(missing.specifiedJobId, null);
  assert.match(missing.notice, /公開を終了/);
  const mismatch = presentSpecifiedJobPage(jobs, c, { id: a.toLowerCase(), title: 'Wrong job' });
  assert.equal(mismatch.specifiedJobId, null);
  assert.deepEqual(mismatch.jobs, jobs);
  assert.deepEqual(presentSpecifiedJobPage(jobs, null, null), { jobs, specifiedJobId: null, notice: null });
});
