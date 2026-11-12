import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApplicationCoreIndependentHandoff, retryApplicationDocumentStatus } from '../src/lib/applicationCoreIndependentHandoff.ts';
import { readApplicationDocumentSnapshot } from '../src/lib/applicationDocumentSnapshotRead.ts';

const candidate = 'synthetic-candidate-A';
const application = 'synthetic-application-A';
const spin = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const snapshot = (overrides = {}) => readApplicationDocumentSnapshot({
  ownerId: candidate,
  applicationId: application,
  isCurrent: () => true,
  loadSaved: async () => [{id:'resume-A', jobseeker_clerk_user_id:candidate}],
  loadSubmitted: async () => [{id:'copy-A', application_id:application}],
  loadExpectations: async () => [{id:'requirement-A',application_id:application}],
  ...overrides,
});

test('authorized application detail and messages are independent of valid document-snapshot delay', async () => {
  const events = [];
  let settleDocument;
  const lateDocument = new Promise(resolve => { settleDocument=resolve; });
  await loadApplicationCoreIndependentHandoff({
    loadDetail: async () => ({application:{id:application}, interviews:[]}),
    loadMessages: async () => [{id:'synthetic-message-A'}],
    loadHandoff: () => lateDocument,
    isCurrent: () => true,
    onDetail: () => events.push('application'),
    onMessages: ({status}) => events.push('message-'+status),
    onHandoff: () => events.push('document'),
  });
  await spin();
  assert.deepEqual(events,['application','message-fulfilled']);
  settleDocument({expectedCount:1,missingSourceDocumentIds:['resume-A']});
  await spin();
  assert.deepEqual(events,['application','message-fulfilled','document']);
  const verified = await snapshot();
  assert.equal(verified.saved[0].id,'resume-A');
  assert.equal(verified.submitted[0].application_id,application);
});

test('wrong-owner document result fails closed without hiding already verified application messages', async () => {
  const messages = [];
  await loadApplicationCoreIndependentHandoff({
    loadDetail: async () => ({application:{id:application},interviews:[]}),
    loadMessages: async () => [{id:'synthetic-message-A'}],
    loadHandoff: async () => ({expectedCount:1}),
    isCurrent: () => true,
    onDetail: () => {},
    onMessages: result => messages.push(result),
    onHandoff: () => {},
  });
  await spin();
  await assert.rejects(snapshot({
    loadSubmitted: async () => [{id:'copy-from-B',application_id:'synthetic-application-B'}],
  }),/所有者または応募先/);
  assert.equal(messages[0].status,'fulfilled');
  assert.equal(messages[0].value[0].id,'synthetic-message-A');
});

test('post-submit document-status retry cannot turn an unknown handoff into verified delivery', async () => {
  const events=[];
  await retryApplicationDocumentStatus({
    read: async () => { throw new Error('synthetic lost connection'); },
    isCurrent: () => true,
    onResult: result => events.push(result),
  });
  assert.deepEqual(events,[{status:'rejected'}]);
  await retryApplicationDocumentStatus({
    read: async () => ({expectedCount:1,missingSourceDocumentIds:[]}),
    isCurrent: () => true,
    onResult: result => events.push(result),
  });
  assert.equal(events[1].status,'fulfilled');
  assert.deepEqual(events[1].value.missingSourceDocumentIds, []);
});

test('candidate switch between parent authorization and document fetch rejects the old snapshot', async () => {
  let isCurrent=true;
  let release;
  const waiting=new Promise(resolve => {release=resolve;});
  const reading=snapshot({isCurrent:()=>isCurrent,loadSubmitted:()=>waiting});
  await spin();
  isCurrent=false;
  release([{id:'copy-A',application_id:application}]);
  await assert.rejects(reading,/閲覧状態/);
});
