import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Source-level integration guard only. Expo/React runtime must still be tested.
const hook = readFileSync(new URL('../src/hooks/usePinnedCandidateAction.ts', import.meta.url), 'utf8');

test('React effect setup activates and cleanup revokes the same lifetime lease', () => {
  assert.match(hook, /useEffect\(\(\) => \{\s*mountLease\.activate\(\);\s*return \(\) => \{ mountLease\.revoke\(\); \};/);
  assert.match(hook, /\[mountLease, session\?\.user\?\.id, session\?\.id\]/);
});

test('pinned session snapshots epoch before token acquisition and verifies it afterwards', () => {
  assert.match(hook, /const launchEpoch = mountLease\.snapshot\(\)/);
  assert.ok(hook.indexOf('const launchEpoch = mountLease.snapshot()') < hook.indexOf('const token = await session.getToken()'));
  assert.match(hook, /!mountLease\.isCurrent\(launchEpoch\)/);
});

test('pinned action retains the session epoch predicate after private-data check', () => {
  assert.match(hook, /if \(!pinned \|\| !pinned\.isCurrent\(\) \|\| !isCurrentOwner/);
  assert.match(hook, /isCurrent: \(\) => pinned\.isCurrent\(\) && isCurrentOwner/);
});

test('Clerk token is pinned to one session, not fetched for every RPC', () => {
  assert.match(hook, /createNativeSupabase\(async \(\) => token\)/);
  assert.match(hook, /current\.userId === ownerId/);
  assert.match(hook, /current\.sessionId === ownerSessionId/);
});
