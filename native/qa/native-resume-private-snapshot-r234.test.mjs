import assert from 'node:assert/strict';
import test from 'node:test';
import { readResumeReviewSnapshotBounded } from '../src/lib/resumeReviewSnapshotRead.ts';
import { boundedPrivateRead } from '../src/lib/privateReadDeadline.ts';

const candidate = (ownerId = 'qa-candidate-1', ownerSessionId = 'qa-session-1', live = () => true) =>
  ({ ownerId, ownerSessionId, isCurrent: live, client: { kind: 'synthetic-authorized-client' } });
const settings = (patch = {}) => ({
  pin: async () => candidate(),
  isCurrent: () => true,
  ownsPin: (pin) => pin.ownerId === 'qa-candidate-1' && pin.ownerSessionId === 'qa-session-1',
  readResume: async () => ({ revision: 7, education: [] }),
  readProfile: async () => ({ clerk_user_id: 'qa-candidate-1' }),
  readPreferences: async () => ({ desired_prefectures: ['東京都'] }),
  timeoutMs: 25,
  ...patch,
});

test('one pinned candidate owns every canonical resume review field', async () => {
  const pins = [];
  const actual = await readResumeReviewSnapshotBounded(settings({
    readResume: async (p) => { pins.push(p); return { revision: 9 }; },
    readProfile: async (p) => { pins.push(p); return { clerk_user_id: p.ownerId }; },
    readPreferences: async (p) => { pins.push(p); return { wants: true }; },
  }));
  assert.equal(pins.length, 3);
  assert.ok(pins.every((p) => p === actual.pinned));
  assert.deepEqual([actual.resume.revision, actual.profile.clerk_user_id, actual.preferences.wants],
    [9, 'qa-candidate-1', true]);
});

test('wrong candidate or Clerk session cannot start any private source', async () => {
  let reads = 0;
  for (const invalid of [candidate('other-candidate'), candidate('qa-candidate-1', 'other-session')]) {
    await assert.rejects(readResumeReviewSnapshotBounded(settings({
      pin: async () => invalid,
      readResume: async () => { reads++; return {}; },
    })), /ログイン状態/);
  }
  assert.equal(reads, 0);
});

test('hung Clerk token rejects before starting any document/profile read', async () => {
  let reads = 0;
  await assert.rejects(readResumeReviewSnapshotBounded(settings({
    pin: () => new Promise(() => {}),
    readResume: async () => { reads++; return {}; },
  })), /タイムアウト/);
  assert.equal(reads, 0);
});

test('a stalled resume RPC rejects the entire snapshot, never a partial preview', async () => {
  await assert.rejects(readResumeReviewSnapshotBounded(settings({
    readResume: () => new Promise(() => {}),
  })), /タイムアウト/);
});

test('a failed profile or preferences read cannot make partial resume data displayable', async () => {
  for (const failed of ['readProfile', 'readPreferences']) {
    await assert.rejects(readResumeReviewSnapshotBounded(settings({
      [failed]: async () => { throw Error('synthetic source failure'); },
    })), /synthetic source failure/);
  }
});

test('a revoked session before results settle cannot publish a stale resume', async () => {
  let current = true;
  let resolveResume;
  const pending = readResumeReviewSnapshotBounded(settings({
    isCurrent: () => current,
    readResume: () => new Promise((resolve) => { resolveResume = resolve; }),
  }));
  for (let i = 0; i < 12 && !resolveResume; i++) await new Promise((r) => setImmediate(r));
  assert.equal(typeof resolveResume, 'function');
  current = false;
  resolveResume({ revision: 9 });
  await assert.rejects(pending, /ログイン状態/);
});

test('a hung local photo-cache read times out independently of canonical record', async () => {
  await assert.rejects(boundedPrivateRead(() => new Promise(() => {}), 20), /タイムアウト/);
});
