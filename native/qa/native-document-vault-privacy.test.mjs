import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCandidateDocumentListOwner, canActOnCandidateDocument, confirmCandidateDocumentMutation } from '../src/lib/documentVaultPrivacy.ts';
const alice = { id: 'doc-a', jobseeker_clerk_user_id: 'candidate-a', file_path: 'jobseekers/candidate-a/doc-a/document.pdf', document_type: 'resume' };
const bob = { ...alice, id: 'doc-b', jobseeker_clerk_user_id: 'candidate-b' };
const ownerA = JSON.stringify(['candidate-a','session-one']);
const ownerB = JSON.stringify(['candidate-a','session-two']);
test('verified list belonging entirely to current candidate passes', () => assert.doesNotThrow(() => assertCandidateDocumentListOwner([alice], 'candidate-a')));
test('foreign, missing, or malformed owner data fails closed', () => {
 for (const records of [[alice, bob], [bob], [{...alice,jobseeker_clerk_user_id: ''}], [{...alice,file_path:''}], [null]]) {
  assert.throws(() => assertCandidateDocumentListOwner(records, 'candidate-a'), /閲覧権限/);
 }
 assert.throws(() => assertCandidateDocumentListOwner([], ''), /閲覧権限/);
});
test('canonical current owner and matching record allow a button', () => assert.equal(canActOnCandidateDocument(alice, [alice], 'candidate-a', ownerA, ownerA, true), true));
test('App Lock, lost verification, session switch and other account deny row actions', () => {
 for (const [o,f,permitted] of [[ownerA,ownerA,false],[ownerA,null,true],[ownerB,ownerA,true],[ownerA,ownerB,true]]) {
  assert.equal(canActOnCandidateDocument(alice,[alice],'candidate-a',o,f,permitted),false);
 }
 assert.equal(canActOnCandidateDocument(alice,[alice],'candidate-b',ownerA,ownerA,true),false);
 assert.equal(canActOnCandidateDocument(alice,null,'candidate-a',ownerA,ownerA,true),false);
});
test('stale/replaced document, mismatched type/path or unknown id denied', () => {
 for(const changed of [{...alice,file_path:'other.pdf'},{...alice,document_type:'other'},{...alice,id:'other'}]){
   assert.equal(canActOnCandidateDocument(changed,[alice],'candidate-a',ownerA,ownerA,true),false);
 }
});

test('canonical mutation confirmation distinguishes uploaded, default, and deleted', () => {
 assert.doesNotThrow(() => confirmCandidateDocumentMutation([alice], 'candidate-a', alice.id, 'uploaded'));
 assert.doesNotThrow(() => confirmCandidateDocumentMutation([{...alice,is_default:true}], 'candidate-a', alice.id, 'made-default'));
 assert.doesNotThrow(() => confirmCandidateDocumentMutation([], 'candidate-a', alice.id, 'deleted'));
});
test('unconfirmed or foreign readbacks never report success', () => {
 for (const [rows, kind] of [[[], 'uploaded'], [[alice], 'deleted'], [[alice], 'made-default']]) {
  assert.throws(() => confirmCandidateDocumentMutation(rows, 'candidate-a', alice.id, kind), /保存結果/);
 }
 assert.throws(() => confirmCandidateDocumentMutation([bob], 'candidate-a', bob.id, 'uploaded'), /閲覧権限/);
 assert.throws(() => confirmCandidateDocumentMutation([alice], 'candidate-a', '', 'uploaded'), /保存結果/);
});
