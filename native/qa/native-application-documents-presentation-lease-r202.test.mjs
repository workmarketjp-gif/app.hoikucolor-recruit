import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { candidateViewOwnerKey, readCandidateFreshlyVerifiedView } from '../src/lib/candidateViewOwner.ts';

test('private document rows belong to the same candidate and Clerk session', () => {
  const original = candidateViewOwnerKey('qa-candidate-a', 'qa-session-a');
  const nextSession = candidateViewOwnerKey('qa-candidate-a', 'qa-session-b');
  const nextCandidate = candidateViewOwnerKey('qa-candidate-b', 'qa-session-a');
  const snapshot = { ownerKey: original, value: { saved: [{ id: 'synthetic' }] } };
  assert.deepEqual(readCandidateFreshlyVerifiedView(snapshot, original, true, original), snapshot.value);
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, nextSession, true, original), null);
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, nextCandidate, true, original), null);
});

test('App Lock and unlock require a new confirmed canonical document read', () => {
  const owner = candidateViewOwnerKey('qa-candidate-a', 'qa-session-a');
  const snapshot = { ownerKey: owner, value: { saved: [{ id: 'synthetic' }] } };
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, owner, false, owner), null);
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, owner, true, null), null);
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, owner, true, owner), snapshot.value);
});

test('missing candidate or session never authorizes a document view', () => {
  assert.equal(candidateViewOwnerKey('', 'qa-session'), null);
  assert.equal(candidateViewOwnerKey('qa-candidate', ''), null);
  const key = candidateViewOwnerKey('qa-candidate', 'qa-session');
  assert.equal(readCandidateFreshlyVerifiedView({ ownerKey: key, value: [] }, null, true, key), null);
});

test('Native document panel gates visible private data, uploads and signed-file opens', () => {
  const source = readFileSync(new URL('../src/components/ApplicationDocumentsSection.tsx', import.meta.url), 'utf8');
  assert.match(source, /readCandidateFreshlyVerifiedView\(/);
  assert.match(source, /usePrivateDataQuarantine\(/);
  assert.match(source, /candidateViewOwnerKey\(pinned\.ownerId, pinned\.ownerSessionId\)/);
  assert.match(source, /setSnapshot\(\{ ownerKey: requestedOwnerKey, value:/);
  assert.match(source, /application-documents-private-shield/);
  assert.match(source, /privacy\.canAccessPrivateData\(\)/);
  assert.doesNotMatch(source, /\bsnapshot\.(saved|submitted|expectations)\b/);
  assert.match(source, /attachJobseekerDocumentToApplication\(/);
  assert.match(source, /createAttachedApplicationDocumentSignedUrl\(/);
});
