import test from 'node:test';
import assert from 'node:assert/strict';
import { captureVaultDeleteConfirmation, canCommitVaultDeleteConfirmation } from '../src/lib/candidateVaultDeleteConfirmation.ts';

const owner = 'synthetic-candidate-a';
const key = JSON.stringify([owner, 'synthetic-session-a']);
const document = Object.freeze({ id: 'document-a', jobseeker_clerk_user_id: owner, file_path: 'synthetic-candidate-a/vault/document-a.pdf', document_type: 'resume' });
const rows = [document];
const proof = () => captureVaultDeleteConfirmation(document, rows, owner, key, key, true, 5);
const commit = (changes = {}) => canCommitVaultDeleteConfirmation(
  changes.proof === undefined ? proof() : changes.proof,
  changes.document ?? document,
  changes.rows === undefined ? rows : changes.rows,
  changes.ownerId === undefined ? owner : changes.ownerId,
  changes.ownerKey === undefined ? key : changes.ownerKey,
  changes.verifiedOwnerKey === undefined ? key : changes.verifiedOwnerKey,
  changes.allowed === undefined ? true : changes.allowed,
  changes.revision === undefined ? 5 : changes.revision,
);

test('exact canonical row, session and revision allow an explicitly confirmed delete', () => {
  assert.deepEqual(proof(), { ownerId: owner, ownerKey: key, revision: 5, documentId: document.id, filePath: document.file_path, documentType: document.document_type });
  assert.equal(commit(), true);
});
test('unverified or shielded row never opens a destructive confirmation', () => {
  assert.equal(captureVaultDeleteConfirmation(document, null, owner, key, key, true, 5), null);
  assert.equal(captureVaultDeleteConfirmation(document, rows, owner, key, key, false, 5), null);
  assert.equal(captureVaultDeleteConfirmation(document, rows, owner, key, key, true, -1), null);
});
test('owner or session switch after alert blocks callback', () => {
  assert.equal(commit({ ownerId: 'synthetic-candidate-b' }), false);
  assert.equal(commit({ ownerKey: JSON.stringify([owner, 'synthetic-session-b']) }), false);
  assert.equal(commit({ verifiedOwnerKey: null }), false);
});
test('app lock or detached view blocks delayed alert callback', () => {
  assert.equal(commit({ allowed: false }), false);
  assert.equal(commit({ rows: null }), false);
});
test('background refresh invalidates confirmation even when row content stays identical', () => {
  assert.equal(commit({ revision: 6 }), false);
});
test('replacement of the same document ID with a different storage key blocks delete', () => {
  assert.equal(commit({ rows: [{ ...document, file_path: `${owner}/vault/replaced.pdf` }] }), false);
});
test('changed document category and different row ID are rejected', () => {
  assert.equal(commit({ rows: [{ ...document, document_type: 'qualification' }] }), false);
  assert.equal(commit({ document: { ...document, id: 'document-b' } }), false);
});
test('callback never becomes valid by supplying a different proof or null proof', () => {
  assert.equal(commit({ proof: null }), false);
  assert.equal(commit({ proof: { ...proof(), documentId: 'document-b' } }), false);
});
test('forged or different candidate row cannot start a delete', () => {
  assert.equal(commit({ rows: [{ ...document, jobseeker_clerk_user_id: 'synthetic-candidate-b' }] }), false);
  assert.equal(commit({ document: { ...document, jobseeker_clerk_user_id: 'synthetic-candidate-b' } }), false);
});
