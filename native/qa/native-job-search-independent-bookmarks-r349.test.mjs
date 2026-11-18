import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSavedJobIdsForSearch } from '../src/lib/jobSearchSavedIndependence.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

test('verified bookmark IDs remain usable (with no mutation)', async () => {
  const result = await loadSavedJobIdsForSearch(async () => [A, B]);
  assert.deepEqual(result, [A, B]);
});
test('verified empty favorites are distinguishable from an unverified response', async () => {
  assert.deepEqual(await loadSavedJobIdsForSearch(async () => []), []);
});
test('rejected candidate-private bookmarked IDs fail closed, without rejecting job search', async () => {
  assert.equal(await loadSavedJobIdsForSearch(async () => { throw new Error('secret auth detail'); }), null);
});
test('an invalid/null response is never interpreted as zero saved jobs', async () => {
  assert.equal(await loadSavedJobIdsForSearch(async () => null), null);
});
test('malformed UUIDs fail closed', async () => {
  assert.equal(await loadSavedJobIdsForSearch(async () => ['not-a-job']), null);
});
test('duplicate UUIDs fail closed, including case-insensitive duplicates', async () => {
  assert.equal(await loadSavedJobIdsForSearch(async () => [A, A.toUpperCase()]), null);
});
test('saved lookup timeout stops UI wait but does not launch an automatic retry', async () => {
  let calls = 0;
  const unresolved = new Promise(() => undefined);
  const start = Date.now();
  assert.equal(await loadSavedJobIdsForSearch(() => { calls++; return unresolved; }, 15), null);
  assert.equal(calls, 1);
  assert.ok(Date.now() - start < 1000);
});
test('late canonical saved IDs cannot silently overwrite a timed-out unknown state', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const result = await loadSavedJobIdsForSearch(() => pending, 10);
  assert.equal(result, null);
  resolve([A]);
  await new Promise((r) => setImmediate(r));
  assert.equal(result, null);
});
test('late private rejection is observed after timeout (no unhandledRejection)', async () => {
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const result = await loadSavedJobIdsForSearch(() => pending, 10);
  assert.equal(result, null);
  reject(new Error('late rpc failure'));
  await new Promise((r) => setImmediate(r));
});
test('invalid deadline retains the existing private-read default, not an immediate invented failure', async () => {
  assert.deepEqual(await loadSavedJobIdsForSearch(async () => [A], NaN), [A]);
});
test('canonical job results remain available when independent saved-ID RPC rejects', async () => {
  let searchReads = 0;
  const [page, bookmarks, specified] = await Promise.all([
    Promise.resolve().then(() => { searchReads++; return { jobs: [{ id: A, title: '合成求人' }], totalCount: 1 }; }),
    loadSavedJobIdsForSearch(async () => { throw new Error('saved RPC unavailable'); }),
    Promise.resolve(null),
  ]);
  assert.equal(searchReads, 1);
  assert.equal(page.jobs.length, 1);
  assert.equal(page.totalCount, 1);
  assert.equal(bookmarks, null); // heart remains disabled; no empty-state inference
  assert.equal(specified, null);
});
