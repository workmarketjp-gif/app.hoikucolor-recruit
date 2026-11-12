import assert from 'node:assert/strict';
import test from 'node:test';
import { readApplicationDocumentSnapshot } from '../src/lib/applicationDocumentSnapshotRead.ts';

const ownerId = 'synthetic-candidate-A';
const applicationId = 'synthetic-application-A';
const valid = (overrides = {}) => ({
  ownerId, applicationId, isCurrent: () => true,
  loadSaved: async () => [{ id: 'owned-resume', jobseeker_clerk_user_id: ownerId }],
  loadSubmitted: async () => [{ id: 'attached-resume', application_id: applicationId }],
  loadExpectations: async () => [{ id: 'expected-resume', application_id: applicationId }],
  ...overrides,
});

test('a matching candidate and application permits the full saved/submitted/expected snapshot', async () => {
  const result = await readApplicationDocumentSnapshot(valid());
  assert.equal(result.saved[0].id, 'owned-resume');
  assert.equal(result.submitted[0].id, 'attached-resume');
  assert.equal(result.expectations[0].id, 'expected-resume');
});
test('canonical [] from each permitted source remains a valid empty state', async () => {
  const result = await readApplicationDocumentSnapshot(valid({
    loadSaved: async () => [], loadSubmitted: async () => [], loadExpectations: async () => [],
  }));
  assert.deepEqual(result, {saved:[], submitted:[], expectations:[]});
});
test('owner or application without a canonical ID launches no private RPC', async () => {
  for (const override of [{ownerId: ''}, {ownerId: ' '}, {applicationId: ''}, {applicationId: ' '}]) {
    let calls = 0;
    const read = async () => { calls += 1; return []; };
    await assert.rejects(readApplicationDocumentSnapshot(valid({
      ...override, loadSaved: read, loadSubmitted: read, loadExpectations: read,
    })), /所有者または応募先/);
    assert.equal(calls, 0);
  }
});
test('another candidate vault document is not published as the current candidate', async () => {
  await assert.rejects(readApplicationDocumentSnapshot(valid({
    loadSaved: async () => [{id:'foreign-doc', jobseeker_clerk_user_id:'synthetic-candidate-B'}],
  })), /所有者または応募先/);
});
test('submitted copy belonging to another application is rejected', async () => {
  await assert.rejects(readApplicationDocumentSnapshot(valid({
    loadSubmitted: async () => [{id:'foreign-attachment',application_id:'synthetic-application-B'}],
  })), /所有者または応募先/);
});
test('expected document belonging to another application is rejected', async () => {
  await assert.rejects(readApplicationDocumentSnapshot(valid({
    loadExpectations: async () => [{id:'foreign-expectation', application_id:'synthetic-application-B'}],
  })), /所有者または応募先/);
});
test('missing or null owner/target in a row does not count as a verified empty result', async () => {
  const cases = [
    {loadSaved: async () => [{id:'unowned'}]},
    {loadSaved: async () => [null]},
    {loadSubmitted: async () => [{id:'unbound'}]},
    {loadExpectations: async () => [null]},
  ];
  for (const bad of cases) {
    await assert.rejects(readApplicationDocumentSnapshot(valid(bad)), /所有者または応募先/);
  }
});
test('revocation after reads begin prevents publishing even matching records', async () => {
  let release, current = true;
  const paused = new Promise((resolve) => {release=resolve;});
  const promise = readApplicationDocumentSnapshot(valid({
    loadSubmitted: () => paused,
    isCurrent: () => current,
  }));
  for (let n=0;n<10;n++) await Promise.resolve();
  current = false;
  release([{ id:'late-attached',application_id:applicationId }]);
  await assert.rejects(promise, /閲覧状態/);
});
