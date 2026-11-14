import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../src/app/(tabs)/saved.tsx', import.meta.url), 'utf8');
const policy = readFileSync(new URL('../src/lib/savedJobsRefreshPolicy.ts', import.meta.url), 'utf8');

test('saved list uses bounded canonical read with exact candidate/session pin', () => {
  assert.match(screen, /readCandidateJobDiscoveryBounded\(\{/);
  assert.match(screen, /read: \(pinned\) => listSavedJobs\(pinned\.client\)/);
  assert.match(screen, /candidateViewOwnerKey\(pinned\.ownerId, pinned\.ownerSessionId\) === requestOwner/);
  assert.match(screen, /readCandidateFreshlyVerifiedView\(ownedJobs,/);
  assert.match(screen, /if \(!privateVisible\) freshlyVerifiedOwner\.current = null/);
  assert.match(screen, /freshlyVerifiedOwner\.current = null;/);
});

test('manual refresh is single flight; stale jobs cannot open, compare or remove', () => {
  assert.match(screen, /canStartSavedJobsRefresh\(\{/);
  assert.match(screen, /refreshPendingRef\.current = true/);
  assert.match(screen, /refreshId === refreshSequence\.current/);
  assert.match(screen, /retainSavedJobsDuringManualRefresh\(\{/);
  assert.match(screen, /onPress=\{\(\) => void load\(true\)\}/);
  assert.match(screen, /const canAct = canActOnSavedJobs\(\{/);
  assert.match(screen, /if \(!canAct \|\| !privateVisibleRef\.current/);
  assert.match(screen, /disabled=\{!canAct\}/);
  assert.match(screen, /disabled=\{!canAct \|\| busyId !== null\}/);
  assert.match(screen, /前回確認できた求人を表示しています。/);
  assert.match(policy, /!options\.loading && !options\.readFailed/);
});

test('unsave has no mutation timeout or retry; readback remains bounded and ambiguous failures quarantine rows', () => {
  assert.match(screen, /\(\) => unsaveJob\(pinned\.client, jobId\)/);
  assert.match(screen, /\(\) => boundedPrivateRead\(\(\) => \{/);
  assert.match(screen, /freshlyVerifiedOwner\.current = null;\s*setOwnedJobs\(null\);/);
  assert.match(screen, /保存状況を確認できませんでした。更新してご確認ください。/);
  assert.doesNotMatch(screen, /retryUnsave|setInterval\(/);
});
