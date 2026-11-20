import test from 'node:test';
import assert from 'node:assert/strict';
import { readCandidateApplicationIndex } from '../src/lib/candidateApplicationIndexRead.ts';
import { canRetainCandidateRowsAfterFailedRead } from '../src/lib/candidateVerifiedReadFailure.ts';

const A = JSON.stringify(['synthetic-A', 'session-1']);
const B = JSON.stringify(['synthetic-B', 'session-2']);
const pin = { client: {source:'synthetic'}, ownerId: 'synthetic-A', ownerSessionId: 'session-1', isCurrent: () => true };
const resolve = (user, session) => JSON.stringify([user, session]);
const base = { retainedAtStart: true, expectedOwnerKey:A, pinnedOwnerKey:A, pinnedSessionCurrent:true, privateAllowed:true };

test('only a newly verified same-session pin permits retaining previously confirmed rows', () => {
  assert.equal(canRetainCandidateRowsAfterFailedRead(base), true);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,retainedAtStart:false}), false);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,expectedOwnerKey:B}), false);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,pinnedOwnerKey:B}), false);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,pinnedOwnerKey:null}), false);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,pinnedSessionCurrent:false}), false);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,privateAllowed:false}), false);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,expectedOwnerKey:null}), false);
});

test('canonical list read failure AFTER a verified pin permits same-session retention, not inferred success', async () => {
  let verified = null;
  let listCalls = 0;
  await assert.rejects(readCandidateApplicationIndex({
    pin: async () => pin,
    list: async () => {listCalls++;throw new Error('NETWORK_FAILURE')},
    expectedOwnerKey:A,resolveOwnerKey:resolve,isActive:()=>true,
    onVerifiedPin: (result) => {verified = result;},
    timeoutMs:200,
  }), /NETWORK_FAILURE/);
  assert.equal(listCalls,1);
  assert.strictEqual(verified,pin);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,pinnedOwnerKey:resolve(verified.ownerId,verified.ownerSessionId),pinnedSessionCurrent:verified.isCurrent()}),true);
});

test('credential pin failure does not verify the candidate or start a list read', async () => {
  let verified = null, listCalls = 0;
  await assert.rejects(readCandidateApplicationIndex({
    pin: async () => {throw new Error('CLERK_TOKEN_EXPIRED')},
    list: async () => {listCalls++;return []},
    expectedOwnerKey:A,resolveOwnerKey:resolve,isActive:()=>true,
    onVerifiedPin: (result) => {verified = result;},timeoutMs:200,
  }), /CLERK_TOKEN_EXPIRED/);
  assert.equal(verified,null);
  assert.equal(listCalls,0);
});

test('wrong-owner pin neither calls list nor validates retention', async () => {
  let verified = null,listCalls=0;
  await assert.rejects(readCandidateApplicationIndex({
    pin: async () => ({...pin,ownerId:'synthetic-B',ownerSessionId:'session-2'}),
    list: async () => {listCalls++;return []}, expectedOwnerKey:A,
    resolveOwnerKey:resolve,isActive:()=>true,
    onVerifiedPin: (result) => {verified = result;},timeoutMs:200,
  }), /安全なログイン/);
  assert.equal(verified,null);
  assert.equal(listCalls,0);
});

test('revoked pin on slow list response does not count as retained authorization', async () => {
  let current=true, verified=null;
  const p={...pin,isCurrent:()=>current};
  await assert.rejects(readCandidateApplicationIndex({
    pin: async()=>p,
    list:async()=>{current=false;throw new Error('READ_REVOKED')},
    expectedOwnerKey:A,resolveOwnerKey:resolve,isActive:()=>true,
    onVerifiedPin:result=>{verified=result},timeoutMs:200,
  }),/READ_REVOKED/);
  assert.strictEqual(verified,p);
  assert.equal(canRetainCandidateRowsAfterFailedRead({...base,pinnedSessionCurrent:verified.isCurrent()}),false);
});

test('no active screen lease cannot initiate token or list read',async()=>{
  let pins=0,lists=0,verified=null;
  await assert.rejects(readCandidateApplicationIndex({
    pin:async()=>{pins++;return pin},list:async()=>{lists++;return[]},
    expectedOwnerKey:A,resolveOwnerKey:resolve,isActive:()=>false,
    onVerifiedPin:result=>{verified=result},timeoutMs:200,
  }),/閲覧状態/);
  assert.equal(pins,0);assert.equal(lists,0);assert.equal(verified,null);
});

test('good read preserves canonical rows and reports its verified pin once',async()=>{
  let pins=0, verified=null;
  const rows=[{id:'synthetic-app-1'}];
  const got=await readCandidateApplicationIndex({
    pin:async()=>{pins++;return pin},list:async()=>rows,
    expectedOwnerKey:A,resolveOwnerKey:resolve,isActive:()=>true,
    onVerifiedPin:result=>{verified=result},timeoutMs:200,
  });
  assert.deepEqual(got,{ownerKey:A,rows});assert.equal(pins,1);assert.strictEqual(verified,pin);
});
