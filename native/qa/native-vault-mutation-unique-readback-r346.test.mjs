import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCandidateVaultMutation } from '../src/lib/reconcileCandidateVaultMutation.ts';

const OWNER = 'synthetic-candidate-A';
const target = Object.freeze({
  id: 'resume-B', jobseeker_clerk_user_id: OWNER, file_path: `jobseekers/${OWNER}/resume-B/document.pdf`,
  document_type: 'resume', is_default: false,
});
const row = (changes={}) => ({...target, ...changes});
const oldDefault = row({id:'resume-A',file_path:`jobseekers/${OWNER}/resume-A/document.pdf`,is_default:false});
const newDefault = row({is_default:true});
const allowedOtherDefault = row({id:'licence-A',file_path:`jobseekers/${OWNER}/licence-A/document.png`, document_type:'nurse_license',is_default:true});
const options = (change={}) => ({target,ownerId:OWNER,action:'made-default',isCurrent:()=>true,
  mutate:async()=>{},readback:async()=>[oldDefault,newDefault,allowedOtherDefault],...change});
const run = (change={}) => reconcileCandidateVaultMutation(options(change));
const uncertain = /書類の更新結果を確認できませんでした/;

test('selecting sole default of one type succeeds with default of another type',async()=>{
  const rows=await run();assert.equal(rows.length,3);
});
test('a lost mutation response can still be confirmed through canonical sole-default readback',async()=>{
  let requests=0;
  const result=await run({mutate:async()=>{requests++;throw Error('synthetic response dropped')}});
  assert.equal(requests,1);assert.equal(result.length,3);
});
test('two simultaneous defaults for same document category must not produce success',async()=>{
  await assert.rejects(run({readback:async()=>[row({id:'resume-A',file_path:'other',is_default:true}),newDefault]}),uncertain);
});
test('canonical duplicate target IDs must not be hidden by Array.find',async()=>{
  await assert.rejects(run({readback:async()=>[newDefault,newDefault]}),uncertain);
});
test('duplicate unrelated document IDs must not masquerade as valid canonical view',async()=>{
  await assert.rejects(run({readback:async()=>[oldDefault,newDefault,allowedOtherDefault,allowedOtherDefault]}),uncertain);
});
test('a stale or wrongly typed target is not acknowledged',async()=>{
  await assert.rejects(run({readback:async()=>[row({document_type:'work_history',is_default:true})]}),uncertain);
});
test('a changed storage path is not acknowledged',async()=>{
  await assert.rejects(run({readback:async()=>[row({file_path:'replaced-path',is_default:true})]}),uncertain);
});
test('a missing default is not acknowledged',async()=>{
  await assert.rejects(run({readback:async()=>[oldDefault,row()]}),uncertain);
});
test('a cross-owner row cannot contaminate candidate readback',async()=>{
  await assert.rejects(run({readback:async()=>[newDefault,row({id:'other',jobseeker_clerk_user_id:'synthetic-candidate-B'})]}),uncertain);
});
test('failed canonical read must not return an empty view as success',async()=>{
  await assert.rejects(run({readback:async()=>{throw Error('synthetic RLS or network failure')}}),uncertain);
});
test('revoke session after mutate: do not issue a readback or acknowledge success',async()=>{
  let current=true,reads=0;
  await assert.rejects(run({isCurrent:()=>current,mutate:async()=>{current=false},readback:async()=>{reads++;return[newDefault]}}),/権限を確認できませんでした/);
  assert.equal(reads,0);
});
test('delete succeeds only when mutation reports completion and target absent',async()=>{
  const rows=await run({action:'deleted',readback:async()=>[allowedOtherDefault]});
  assert.equal(rows.length,1);
});
test('delete does not claim success merely because ambiguous RPC readback lacks target',async()=>{
  await assert.rejects(run({action:'deleted',mutate:async()=>{throw Error('synthetic ambiguous write')},readback:async()=>[]}),uncertain);
});
test('delete must not acknowledge duplicate canonical rows as trustworthy',async()=>{
  await assert.rejects(run({action:'deleted',readback:async()=>[allowedOtherDefault,allowedOtherDefault]}),uncertain);
});
test('delete never acknowledges a still-existing target',async()=>{
  await assert.rejects(run({action:'deleted',readback:async()=>[newDefault]}),uncertain);
});
test('mutation is never repeated automatically after dropped RPC response',async()=>{
  let calls=0;
  await assert.rejects(run({mutate:async()=>{calls++;throw Error('synthetic ambiguous write')},readback:async()=>[row()]}),uncertain);
  assert.equal(calls,1);
});
