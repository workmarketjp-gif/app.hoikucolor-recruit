import assert from 'node:assert/strict';
import test from 'node:test';
import { readApplicationDocumentSnapshot } from '../src/lib/applicationDocumentSnapshotRead.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const valid = (override = {}) => ({
  ownerId: 'synthetic-candidate-A',
  applicationId: 'synthetic-application-A',
  loadSaved: async () => [{ id: 'synthetic-owned-document', jobseeker_clerk_user_id: 'synthetic-candidate-A' }],
  loadSubmitted: async () => [{ id: 'synthetic-submitted-document', application_id: 'synthetic-application-A' }],
  loadExpectations: async () => [{ id: 'synthetic-expected-document', application_id: 'synthetic-application-A' }],
  isCurrent: () => true,
  ...override,
});

test('all three confirmed canonical reads make one complete snapshot', async () => {
  const snapshot = await readApplicationDocumentSnapshot(valid());
  assert.equal(snapshot.saved[0].id, 'synthetic-owned-document');
  assert.equal(snapshot.submitted[0].id, 'synthetic-submitted-document');
  assert.equal(snapshot.expectations[0].id, 'synthetic-expected-document');
});
test('a genuinely empty successful triple read is distinct from failure', async () => {
  assert.deepEqual(await readApplicationDocumentSnapshot(valid({
    loadSaved: async () => [], loadSubmitted: async () => [], loadExpectations: async () => [],
  })), { saved: [], submitted: [], expectations: [] });
});
test('revocation before the microtask launch makes ZERO private reads', async () => {
  let current = true, calls = 0;
  const read = () => { calls++; return Promise.resolve([]); };
  const pending = readApplicationDocumentSnapshot(valid({
    loadSaved: read, loadSubmitted: read, loadExpectations: read,
    isCurrent: () => current,
  }));
  current = false;
  await assert.rejects(pending, /閲覧状態/);
  assert.equal(calls, 0);
});
test('revocation while one RPC is pending suppresses the entire private snapshot', async () => {
  let current = true;
  const unfinished = deferred();
  const pending = readApplicationDocumentSnapshot(valid({
    loadSubmitted: () => unfinished.promise,
    isCurrent: () => current,
  }));
  for (let n=0;n<10;n++) await Promise.resolve();
  current=false;
  unfinished.resolve([{ id: 'synthetic-old-account' }]);
  await assert.rejects(pending,/閲覧状態/);
});
test('transport rejection never converts the saved rows or expectations into empty lists', async () => {
  await assert.rejects(readApplicationDocumentSnapshot(valid({
    loadSubmitted: async () => {throw new Error('synthetic transport offline');},
  })), /transport offline/);
});
test('canonical null for one source is an unverified failure, not an empty list', async () => {
  await assert.rejects(readApplicationDocumentSnapshot(valid({
    loadExpectations: async () => null,
  })), /一部を確認/);
});
test('non-array canonical shape is rejected before projecting submitted copies', async () => {
  await assert.rejects(readApplicationDocumentSnapshot(valid({
    loadSaved: async () => ({ success: true }),
  })), /一部を確認/);
});
test('one stalled source times out without falsely confirming a partial document snapshot', async () => {
  await assert.rejects(readApplicationDocumentSnapshot(valid({
    loadSubmitted: () => new Promise(() => {}), timeoutMs: 10,
  })), /タイムアウト/);
});
test('late rejected RPC after timeout is consumed, with no second settlement', async () => {
  const late = deferred();
  const events = [];
  await readApplicationDocumentSnapshot(valid({
    loadSubmitted: () => late.promise, timeoutMs: 10,
  })).then(() => events.push('success'), () => events.push('error'));
  late.reject(new Error('late transport rejection'));
  for (let n=0;n<10;n++) await Promise.resolve();
  assert.deepEqual(events, ['error']);
});
