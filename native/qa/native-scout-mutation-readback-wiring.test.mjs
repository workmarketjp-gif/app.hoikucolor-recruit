import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const screen = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/app/scouts.tsx'), 'utf8');

test('scout response uses canonical same-session readback instead of a local fabricated response timestamp', () => {
  assert.match(screen, /confirmScoutDecision\(\s*await listJobseekerScouts\(pinned\.client\), item\.scout_id, decision\)/);
  assert.doesNotMatch(screen, /responded_at:\s*new Date\(\)/);
  assert.match(screen, /writePendingRef\.current = true/);
});
test('all privacy mutations use canonical server readback and live owner fence', () => {
  assert.match(screen, /confirmScoutOptIn\(await getScoutPrivacySettings\(pinned\.client\), enabled\)/);
  assert.match(screen, /getScoutPrivacySettings\(pinned\.client\), organization\.organization_id, true/);
  assert.match(screen, /getScoutPrivacySettings\(pinned\.client\), organizationId, false/);
  assert.match(screen, /currentOwnerRef\.current === owner/);
  assert.match(screen, /sessionCurrent: pinned\.isCurrent\(\)/);
});
test('ambiguous mutation outcome revokes old presentation and requires authenticated reload', () => {
  assert.match(screen, /verifiedOwnerRef\.current = null;\s*errorOwnerRef\.current = owner;\s*setScouts\(\[\]\);\s*setPrivacy\(null\)/);
  assert.match(screen, /failScoutWrite\(serial, owner, readGeneration\)/);
});
