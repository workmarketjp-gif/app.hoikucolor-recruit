import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readOptionalSpecifiedJob, presentOptionalSpecifiedJobPage,
} from '../src/lib/jobSearchSpecifiedLookup.ts';

const first = 'f77b08c2-42fa-4873-9b49-f5f8ae25bb47';
const second = 'beea4344-b89b-40eb-8ae2-72bc223f320d';
const currentPage = [{ id: first, title: '正規の求人' }];

test('plain search skips the optional exact-job RPC entirely', async () => {
  let reads = 0;
  const result = await readOptionalSpecifiedJob(null, async () => { reads++; return null; });
  assert.deepEqual(result, { kind: 'skipped', job: null });
  assert.equal(reads, 0);
  assert.deepEqual(presentOptionalSpecifiedJobPage(currentPage, null, result), {
    jobs: currentPage, specifiedJobId: null, notice: null,
  });
});

test('verified exact job is pinned once and not duplicated in organic results', async () => {
  const chosen = { id: second, title: '指定された園' };
  const result = await readOptionalSpecifiedJob(second, async (id) => {
    assert.equal(id, second);
    return chosen;
  });
  const visible = presentOptionalSpecifiedJobPage(currentPage, second, result);
  assert.deepEqual(visible.jobs, [chosen, ...currentPage]);
  assert.equal(visible.specifiedJobId, second);
  assert.equal(visible.notice, null);
});

test('exact job already present in page is not duplicated', async () => {
  const result = await readOptionalSpecifiedJob(first, async () => currentPage[0]);
  const visible = presentOptionalSpecifiedJobPage(currentPage, first, result);
  assert.deepEqual(visible.jobs, currentPage);
  assert.equal(visible.specifiedJobId, first);
});

test('canonical null is an unavailable job, not a failed search', async () => {
  const result = await readOptionalSpecifiedJob(second, async () => null);
  const visible = presentOptionalSpecifiedJobPage(currentPage, second, result);
  assert.equal(result.kind, 'unavailable');
  assert.deepEqual(visible.jobs, currentPage);
  assert.match(visible.notice, /公開を終了/);
  assert.equal(visible.specifiedJobId, null);
});

test('specific lookup fails but previously verified search page remains available', async () => {
  const result = await readOptionalSpecifiedJob(second, async () => {
    throw new Error('private/internal/server-path');
  });
  const visible = presentOptionalSpecifiedJobPage(currentPage, second, result);
  assert.equal(result.kind, 'failed');
  assert.deepEqual(visible.jobs, currentPage);
  assert.equal(visible.specifiedJobId, null);
  assert.match(visible.notice, /指定求人を確認できませんでした/);
  assert.doesNotMatch(visible.notice, /private|internal|server-path|終了/);
});

test('bounded optional lookup does not stall the canonical page when RPC hangs', async () => {
  let rejectLate;
  const pending = new Promise((_, reject) => { rejectLate = reject; });
  const start = Date.now();
  const result = await readOptionalSpecifiedJob(second, async () => pending, 15);
  assert.equal(result.kind, 'failed');
  assert.ok(Date.now() - start < 1500);
  rejectLate(new Error('late transport failure'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(presentOptionalSpecifiedJobPage(currentPage, second, result).jobs, currentPage);
});

test('mismatched and malformed lookup rows never become specified jobs', async () => {
  const wrong = await readOptionalSpecifiedJob(second, async () => currentPage[0]);
  const invalid = await readOptionalSpecifiedJob(second, async () => ({ id: 42 }));
  assert.equal(wrong.kind, 'failed');
  assert.equal(invalid.kind, 'failed');
  assert.equal(presentOptionalSpecifiedJobPage(currentPage, second, wrong).specifiedJobId, null);
});

test('an unverified lookup never fabricates a job when the organic page is empty', async () => {
  const failed = await readOptionalSpecifiedJob(second, async () => Promise.reject(new Error('network')));
  const visible = presentOptionalSpecifiedJobPage([], second, failed);
  assert.deepEqual(visible.jobs, []);
  assert.match(visible.notice, /確認できませんでした/);
  assert.equal(visible.specifiedJobId, null);
});

test('search, saved status and optional specified job resolve independently', async () => {
  const [page, savedIds, exact] = await Promise.all([
    Promise.resolve({ jobs: currentPage, totalCount: 1, hasMore: false }),
    Promise.resolve([first]),
    readOptionalSpecifiedJob(second, async () => Promise.reject(new Error('RPC temporarily failed'))),
  ]);
  const result = presentOptionalSpecifiedJobPage(page.jobs, second, exact);
  assert.deepEqual(result.jobs, currentPage);
  assert.equal(page.totalCount, 1);
  assert.deepEqual(savedIds, [first]);
  assert.equal(exact.kind, 'failed');
  assert.ok(result.notice);
});
