import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { candidateViewOwnerKey, readCandidateOwnedView } from '../src/lib/candidateViewOwner.ts';

const userA = candidateViewOwnerKey('candidate:A', 'session:1');
const userB = candidateViewOwnerKey('candidate:B', 'session:1');
const secondSession = candidateViewOwnerKey('candidate:A', 'session:2');
const original = { ownerKey: userA, value: [{ applicationId: 'synthetic-A-only' }] };

test('same user and exact session may read the current in-memory list', () => {
  assert.deepEqual(readCandidateOwnedView(original, userA, true), original.value);
});
test('different account never sees previous candidate list', () => {
  assert.equal(readCandidateOwnedView(original, userB, true), null);
});
test('new session for same user cannot inherit previous session private list', () => {
  assert.equal(readCandidateOwnedView(original, secondSession, true), null);
});
test('App Lock/privacy quarantine suppresses previous read, even for same owner', () => {
  assert.equal(readCandidateOwnedView(original, userA, false), null);
});
test('no loaded snapshot is not a confirmed empty list', () => {
  assert.equal(readCandidateOwnedView(null, userA, true), null);
});
test('signed out or incomplete identity cannot display prior state', () => {
  assert.equal(readCandidateOwnedView(original, null, true), null);
  assert.equal(candidateViewOwnerKey('', 'session:1'), null);
  assert.equal(candidateViewOwnerKey('candidate:A', '  '), null);
});
test('delimiter and special-character collisions do not join identities', () => {
  assert.notEqual(candidateViewOwnerKey('a:b', 'c'), candidateViewOwnerKey('a', 'b:c'));
  assert.notEqual(candidateViewOwnerKey('a]",', 'b'), candidateViewOwnerKey('a', '"]b'));
});
test('empty authorized list remains different from unloaded list', () => {
  assert.deepEqual(readCandidateOwnedView({ ownerKey: userA, value: [] }, userA, true), []);
  assert.equal(readCandidateOwnedView(null, userA, true), null);
});
test('unknown identity and inherited object keys do not grant access', () => {
  assert.equal(readCandidateOwnedView(original, '__proto__', true), null);
  assert.equal(readCandidateOwnedView(original, 'constructor', true), null);
});

const jobsScreenSource = readFileSync(
  fileURLToPath(new URL('../src/app/(tabs)/jobs.tsx', import.meta.url)),
  'utf8',
);

test('job rows and error text use the same session-owned visibility boundary', () => {
  const jobs = { ownerKey: userA, value: [{ id: 'synthetic-job-A' }] };
  const error = { ownerKey: userA, value: 'synthetic-A-only-error' };
  assert.deepEqual(readCandidateOwnedView(jobs, userA, true), jobs.value);
  assert.equal(readCandidateOwnedView(jobs, userB, true), null);
  assert.equal(readCandidateOwnedView(jobs, secondSession, true), null);
  assert.equal(readCandidateOwnedView(jobs, userA, false), null);
  assert.equal(readCandidateOwnedView(error, userB, true), null);
  assert.equal(readCandidateOwnedView(error, userA, false), null);
});

test('real Jobs screen fences rows, errors, count and pagination before rendering', () => {
  assert.match(jobsScreenSource, /const visibleJobs = readCandidateOwnedView\(ownedJobs, ownerKey, privateAllowed\)/);
  assert.match(jobsScreenSource, /const error = readCandidateOwnedView\(ownedError, ownerKey, privateAllowed\)/);
  assert.match(jobsScreenSource, /const jobs = visibleJobs \?\? \[\]/);
  assert.match(jobsScreenSource, /if \(!ownedKey \|\| ownedKey !== ownerKey\) return previous;/);
  assert.match(jobsScreenSource, /visibleJobs === null \? '—'/);
  assert.match(jobsScreenSource, /hasMore && visibleJobs !== null/);
  assert.doesNotMatch(jobsScreenSource, /\bsetJobs\(/);
  assert.doesNotMatch(jobsScreenSource, /\bsetError\(/);
});
