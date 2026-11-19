import test from 'node:test';
import assert from 'node:assert/strict';
import { canActOnCandidateDocument, confirmCandidateDocumentMutation } from '../src/lib/documentVaultPrivacy.ts';
import { requireFreshVaultReplacement } from '../src/lib/requireFreshVaultReplacement.ts';

const doc = (id='old', owner='candidate-A', type='resume', path='private/A/old', isDefault=true) =>
  ({id, jobseeker_clerk_user_id:owner, document_type:type, file_path:path, is_default:isDefault});
const first=doc();
const verified=(canonical, other={})=>requireFreshVaultReplacement({
 previous:first, visibleRows:[first], canonicalRows:canonical, ownerId:'candidate-A',selectedType:'resume',
 initialRevision:8,currentRevision:8,isCurrent:()=>true,...other
});
test('default replacement permits a confirmed unchanged source',()=>assert.doesNotThrow(()=>verified([first])));
test('replacement aborts when the canonical default switches',()=>{
 assert.throws(()=>verified([doc('old','candidate-A','resume','private/A/old',false),doc('new')]));
});
test('replacement aborts if picker resumed after a revision change',()=>{
 assert.throws(()=>verified([first],{currentRevision:9}));
});
test('replacement aborts on duplicate document identities',()=>{
 assert.throws(()=>verified([first,first]));
});
test('replacement aborts if the account changes',()=>{
 assert.throws(()=>verified([first],{ownerId:'candidate-B'}));
});
test('replacement aborts if session is revoked after list retrieval',()=>{
 assert.throws(()=>verified([first],{isCurrent:()=>false}));
});
test('opening a private document is forbidden on mixed-owner list',()=>{
 assert.equal(canActOnCandidateDocument(first,[first,doc('x','candidate-B')],'candidate-A','session-A','session-A',true),false);
});
test('opening a private document is forbidden on duplicated IDs',()=>{
 assert.equal(canActOnCandidateDocument(first,[first,first],'candidate-A','session-A','session-A',true),false);
});
test('opening a private document requires matching verified source',()=>{
 assert.equal(canActOnCandidateDocument(first,[first],'candidate-A','session-A','session-A',true),true);
 assert.equal(canActOnCandidateDocument(first,[doc('old','candidate-A','resume','private/A/other')],'candidate-A','session-A','session-A',true),false);
});
test('upload acknowledgment requires exact saved object identity',()=>{
 const saved=doc('new','candidate-A','resume','private/A/new');
 assert.doesNotThrow(()=>confirmCandidateDocumentMutation([saved],'candidate-A','new','uploaded',saved));
 assert.throws(()=>confirmCandidateDocumentMutation([doc('new','candidate-A','resume','private/A/other')],'candidate-A','new','uploaded',saved));
});
test('upload acknowledgment cannot conceal two defaults',()=>{
 const saved=doc('new','candidate-A','resume','private/A/new');
 assert.throws(()=>confirmCandidateDocumentMutation([saved,first],'candidate-A','new','uploaded',saved));
});
test('independent document types keep independent defaults',()=>{
 const saved=doc('new','candidate-A','resume','private/A/new');
 const cert=doc('cert','candidate-A','qualification','private/A/cert');
 assert.doesNotThrow(()=>confirmCandidateDocumentMutation([saved,cert],'candidate-A','new','uploaded',saved));
});
