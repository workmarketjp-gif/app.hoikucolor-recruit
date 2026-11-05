import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCandidateFreshlyVerifiedView } from '../src/lib/candidateViewOwner.ts';

const ownerA = '["candidate-a","session-1"]';
const ownerB = '["candidate-b","session-1"]';
const snapshot = { ownerKey: ownerA, value: ['synthetic application'] };

test('verified current owner sees freshly fetched canonical applications', () => {
  assert.deepEqual(readCandidateFreshlyVerifiedView(snapshot, ownerA, true, ownerA), snapshot.value);
});
test('App Lock hides the snapshot even before state cleanup effects', () => {
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, ownerA, false, ownerA), null);
});
test('unlock cannot reuse a same-session snapshot without a new successful read', () => {
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, ownerA, true, null), null);
});
test('other candidate and session tokens cannot unlock private rows', () => {
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, ownerB, true, ownerB), null);
  assert.equal(readCandidateFreshlyVerifiedView(snapshot, ownerA, true, ownerB), null);
});
test('unmounted/empty snapshots never show data', () => {
  assert.equal(readCandidateFreshlyVerifiedView(null, ownerA, true, ownerA), null);
});
test('screen invalidates the lease before refreshing and during the privacy shield', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/app/(tabs)/applications.tsx', import.meta.url)), 'utf8');
  assert.match(source, /if \(!privateAllowed\) freshlyVerifiedOwner\.current = null/);
  assert.match(source, /const current = \+\+generation\.current;\s*freshlyVerifiedOwner\.current = null/);
  assert.match(source, /freshlyVerifiedOwner\.current = verifiedOwner;\s*setOwnedApplications/);
  assert.match(source, /readCandidateFreshlyVerifiedView\(ownedApplications, ownerKey, privateAllowed, freshlyVerifiedOwner\.current\)/);
});

test('list refuses private reads while locked and starts a fresh load on unlock', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/app/(tabs)/applications.tsx', import.meta.url)), 'utf8');
  assert.match(source, /const privateAllowed = !privacy\.shieldVisible && privacy\.canAccessPrivateData\(\)/);
  assert.match(source, /if \(!ownerKey \|\| !privateAllowed\) \{[\s\S]*?generation\.current \+= 1;[\s\S]*?freshlyVerifiedOwner\.current = null;[\s\S]*?setOwnedApplications\(null\);[\s\S]*?return;\s*\}\s*void load\(\);/);
  assert.match(source, /\}, \[ownerKey, privateAllowed, load\]\);/);
});
