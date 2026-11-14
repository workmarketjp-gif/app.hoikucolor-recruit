import assert from 'node:assert/strict';
import test from 'node:test';
import { readResumeLinkedProfileSnapshotBounded } from '../src/lib/resumeLinkedCanonicalRead.ts';

const pinFor = (owner = 'synthetic-A', session = 'synthetic-session', isCurrent = () => true) =>
  ({ ownerId: owner, ownerSessionId: session, isCurrent });
const options = (patch = {}) => ({
  pin: async () => pinFor(),
  isCurrent: () => true,
  ownsPin: (p) => p.ownerId === 'synthetic-A' && p.ownerSessionId === 'synthetic-session',
  readProfile: async () => ({ clerk_user_id: 'synthetic-A', qualifications: ['保育士'] }),
  readPreferences: async () => ({ classroom_experience: ['0歳児'] }),
  timeoutMs: 25,
  ...patch,
});

test('one authorized session supplies both canonical datasets with no mutation', async () => {
  const pins = [];
  const actual = await readResumeLinkedProfileSnapshotBounded(options({
    readProfile: async p => { pins.push(p); return { clerk_user_id: p.ownerId }; },
    readPreferences: async p => { pins.push(p); return { classroom_experience: [] }; },
  }));
  assert.equal(pins.length, 2);
  assert.equal(pins[0], pins[1]);
  assert.equal(pins[0], actual.pinned);
  assert.equal(actual.profile.clerk_user_id, 'synthetic-A');
  assert.deepEqual(actual.preferences.classroom_experience, []);
});

test('foreign account or session cannot launch either private RPC', async () => {
  let reads = 0;
  for (const foreign of [pinFor('synthetic-B'), pinFor('synthetic-A', 'revoked-session')]) {
    await assert.rejects(readResumeLinkedProfileSnapshotBounded(options({
      pin: async () => foreign,
      readProfile: async () => { reads++; return {}; },
      readPreferences: async () => { reads++; return {}; },
    })), /ログイン状態/);
  }
  assert.equal(reads, 0);
});

test('hung pre-read Clerk token expires and cannot start a late canonical read', async () => {
  let release, reads = 0;
  const pending = readResumeLinkedProfileSnapshotBounded(options({
    pin: () => new Promise(resolve => { release = resolve; }),
    readProfile: async () => { reads++; return {}; },
    readPreferences: async () => { reads++; return {}; },
  }));
  await assert.rejects(pending, /タイムアウト/);
  release(pinFor());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 0);
});

test('either hung canonical RPC expires without converting failed read into empty edit data', async () => {
  for (const field of ['readProfile', 'readPreferences']) {
    await assert.rejects(readResumeLinkedProfileSnapshotBounded(options({
      [field]: () => new Promise(() => {}),
    })), /タイムアウト/);
  }
});

test('one rejected canonical read rejects the entire pair', async () => {
  await assert.rejects(readResumeLinkedProfileSnapshotBounded(options({
    readPreferences: async () => { throw new Error('synthetic failure'); },
  })), /synthetic failure/);
});

test('screen revoked before token microtask prevents Clerk token request', async () => {
  let live = true, pins = 0;
  const pending = readResumeLinkedProfileSnapshotBounded(options({
    isCurrent: () => live,
    pin: async () => { pins++; return pinFor(); },
  }));
  live = false;
  await assert.rejects(pending, /ログイン状態/);
  assert.equal(pins, 0);
});

test('revocation after RPC launch rejects a late otherwise-valid snapshot', async () => {
  let live = true, resolvePrefs;
  const pending = readResumeLinkedProfileSnapshotBounded(options({
    isCurrent: () => live,
    readPreferences: () => new Promise(resolve => { resolvePrefs = resolve; }),
  }));
  for (let n = 0; n < 12 && !resolvePrefs; n++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof resolvePrefs, 'function');
  live = false;
  resolvePrefs({ classroom_experience: ['fake'] });
  await assert.rejects(pending, /ログイン状態/);
});
