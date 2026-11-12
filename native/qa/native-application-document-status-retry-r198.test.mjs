import assert from 'node:assert/strict';
import test from 'node:test';
import { retryApplicationDocumentStatus } from '../src/lib/applicationCoreIndependentHandoff.ts';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const flush = async () => { for (let n=0;n<8;n++) await Promise.resolve(); };

test('confirmed document-only retry publishes fresh canonical handoff', async () => {
  let reads=0; const results=[];
  await retryApplicationDocumentStatus({read:async()=>{reads++;return {missingSourceDocumentIds:[],expectedCount:1};},isCurrent:()=>true,onResult:x=>results.push(x)});
  assert.equal(reads,1);
  assert.deepEqual(results,[{status:'fulfilled',value:{missingSourceDocumentIds:[],expectedCount:1}}]);
});
test('canonical null stays unverified, not delivered', async () => {
  const results=[];
  await retryApplicationDocumentStatus({read:async()=>null,isCurrent:()=>true,onResult:x=>results.push(x)});
  assert.deepEqual(results,[{status:'fulfilled',value:null}]);
});
test('transport failure is unverified, not an empty attachment list', async () => {
  const results=[];
  await retryApplicationDocumentStatus({read:async()=>{throw new Error('offline');},isCurrent:()=>true,onResult:x=>results.push(x)});
  assert.deepEqual(results,[{status:'rejected'}]);
});
test('revoked before microtask launch never calls a private RPC',async()=>{
  let current=true,calls=0;const results=[];
  const p=retryApplicationDocumentStatus({read:async()=>{calls++;return null;},isCurrent:()=>current,onResult:x=>results.push(x)});
  current=false;await p;assert.equal(calls,0);assert.deepEqual(results,[]);
});
test('account switch mid-read suppresses stale private state',async()=>{
  const pending=deferred();let current=true;const results=[];
  const p=retryApplicationDocumentStatus({read:()=>pending.promise,isCurrent:()=>current,onResult:x=>results.push(x)});
  await flush();current=false;pending.resolve({missingSourceDocumentIds:['synthetic-old']});
  await p;assert.deepEqual(results,[]);
});
test('timeout yields one unverified result and cannot publish late success',async()=>{
  const pending=deferred();const results=[];
  await retryApplicationDocumentStatus({read:()=>pending.promise,isCurrent:()=>true,onResult:x=>results.push(x),timeoutMs:10});
  assert.deepEqual(results,[{status:'rejected'}]);pending.resolve({missingSourceDocumentIds:[]});await flush();
  assert.deepEqual(results,[{status:'rejected'}]);
});
test('late reject after screen revocation is consumed without publication',async()=>{
  const pending=deferred();let current=true;const results=[];
  const p=retryApplicationDocumentStatus({read:()=>pending.promise,isCurrent:()=>current,onResult:x=>results.push(x)});
  await flush();current=false;pending.reject(new Error('late'));await p;
  assert.deepEqual(results,[]);
});
