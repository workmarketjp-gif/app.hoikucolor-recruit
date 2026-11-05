import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import test from 'node:test';

const screen = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/app/scouts.tsx'), 'utf8');

test('scout screen separates the private session gate from server scout privacy preferences', () => {
  assert.match(screen, /const privateQuarantine = usePrivateDataQuarantine\(\);/);
  assert.equal([...screen.matchAll(/const\s+(?:\[\s*privacy\s*,|\s+privacy\s*=)/g)].length, 1);
  assert.doesNotMatch(screen, /const privacy = usePrivateDataQuarantine\(\);/);
  assert.match(screen, /privacy\.automatic_blocks\.map/);
  assert.match(screen, /privacy\.manual_blocks\.map/);
});

test('focus and render gate prevent a locked or unauthenticated candidate read', () => {
  assert.match(screen, /const privateAllowed = Boolean\(ownerKey\) && !privateQuarantine\.shieldVisible && privateQuarantine\.canAccessPrivateData\(\)/);
  assert.match(screen, /if \(!privateAllowed\) \{\s*generation\.current \+= 1;\s*verifiedOwnerRef\.current = null;/);
  assert.match(screen, /const verifiedVisible = privateAllowed && verifiedOwnerRef\.current === ownerKey/);
});

test('in-flight read and previous-owner errors cannot be presented as current private data', () => {
  assert.match(screen, /current !== generation\.current \|\| !privateQuarantine\.canAccessPrivateData\(\)/);
  assert.match(screen, /if \(!verifiedOwner \|\| verifiedOwner !== ownerKey\) return;/);
  assert.match(screen, /const safeError = privateAllowed && errorOwnerRef\.current === ownerKey \? error : null;/);
  assert.match(screen, /setNotice\(null\);\s*setScouts\(\[\]\);\s*setPrivacy\(null\);\s*setBlockResults\(\[\]\);/);
});
