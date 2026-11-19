import test from 'node:test';
import assert from 'node:assert/strict';
import { readSpotApplicationPreflight } from '../src/lib/spotApplicationPreflight.ts';

const pin = (ownerId = 'synthetic-A', isCurrent = () => true) => ({ ownerId, ownerSessionId: 'synthetic-session-A', isCurrent });
const options = (extra = {}) => ({
  pin: async () => pin(),
  readProfile: async () => ({ clerk_user_id: 'synthetic-A', name: '合成候補者' }),
  isCurrent: () => true,
  ownsPin: p => p.ownerId === 'synthetic-A' && p.ownerSessionId === 'synthetic-session-A',
  timeoutMs: 25,
  ...extra,
});

test('returns an owner-verified profile without sending a mutation', async () => {
  let profiles = 0;
  const result = await readSpotApplicationPreflight(options({
    readProfile: async () => { profiles++; return { clerk_user_id: 'synthetic-A', name: '合成候補者' }; },
  }));
  assert.equal(result.pinned.ownerId, 'synthetic-A');
  assert.equal(result.profile.name, '合成候補者');
  assert.equal(profiles, 1);
});

test('a genuine missing profile remains null for the existing profile route', async () => {
  const result = await readSpotApplicationPreflight(options({ readProfile: async () => null }));
  assert.equal(result.profile, null);
});

test('does not request a token or profile after preflight loses its screen lease', async () => {
  let current = true, pins = 0, reads = 0;
  const result = readSpotApplicationPreflight(options({
    isCurrent: () => current,
    pin: async () => { pins++; return pin(); },
    readProfile: async () => { reads++; return null; },
  }));
  current = false;
  await assert.rejects(result, /ログイン状態/);
  assert.equal(pins, 0);
  assert.equal(reads, 0);
});

test('a hanging Clerk token pin times out and never starts a profile RPC', async () => {
  let reads = 0;
  await assert.rejects(readSpotApplicationPreflight(options({
    pin: () => new Promise(() => {}),
    readProfile: async () => { reads++; return null; },
  })), /タイムアウト/);
  assert.equal(reads, 0);
});

test('a hanging candidate profile RPC times out without treating it as missing profile', async () => {
  await assert.rejects(readSpotApplicationPreflight(options({
    readProfile: () => new Promise(() => {}),
  })), /タイムアウト/);
});

test('wrong candidate profile is rejected even when the pinned session is correct', async () => {
  await assert.rejects(readSpotApplicationPreflight(options({
    readProfile: async () => ({ clerk_user_id: 'synthetic-B', name: '異なる候補者' }),
  })), /プロフィールの所有者/);
});

test('wrong pinned candidate/session prevents the profile read', async () => {
  let reads = 0;
  for (const wrongPin of [pin('synthetic-B'), { ...pin(), ownerSessionId: 'synthetic-session-B' }]) {
    await assert.rejects(readSpotApplicationPreflight(options({
      pin: async () => wrongPin,
      readProfile: async () => { reads++; return null; },
    })), /ログイン状態/);
  }
  assert.equal(reads, 0);
});

test('session change during profile fetch refuses late profile', async () => {
  let resolveRead;
  let current = true;
  const result = readSpotApplicationPreflight(options({
    isCurrent: () => current,
    readProfile: () => new Promise(resolve => { resolveRead = resolve; }),
  }));
  for (let i=0; i<10 && !resolveRead; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof resolveRead, 'function');
  current = false;
  resolveRead({ clerk_user_id: 'synthetic-A' });
  await assert.rejects(result, /ログイン状態/);
});

test('late completion after a timeout is observed but not published', async () => {
  let resolveRead;
  const result = readSpotApplicationPreflight(options({
    readProfile: () => new Promise(resolve => { resolveRead = resolve; }),
  }));
  await assert.rejects(result, /タイムアウト/);
  resolveRead({ clerk_user_id: 'synthetic-A' });
  await new Promise(resolve => setImmediate(resolve));
});

test('late rejection after a timeout is consumed and not unhandled', async () => {
  let rejectRead;
  const result = readSpotApplicationPreflight(options({
    readProfile: () => new Promise((_resolve, reject) => { rejectRead = reject; }),
  }));
  await assert.rejects(result, /タイムアウト/);
  rejectRead(new Error('synthetic denied after timeout'));
  await new Promise(resolve => setImmediate(resolve));
});

test('a rejected profile read remains a failure, never an empty profile', async () => {
  await assert.rejects(readSpotApplicationPreflight(options({
    readProfile: async () => { throw new Error('synthetic RPC denied'); },
  })), /synthetic RPC denied/);
});
