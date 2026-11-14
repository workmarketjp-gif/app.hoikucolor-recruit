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

// Exact production pre-write and post-write read helpers are shared with profile.
// These tests never issue a real mutation; they assert the invocation boundary.
import { pinCandidateProfilePrewrite, readCandidateProfileAfterWrite } from '../src/lib/profileCanonicalRead.ts';

test('hung prewrite Clerk pin expires without starting an upsert or preference save', async () => {
  let writes = 0;
  const operation = (async () => {
    await pinCandidateProfilePrewrite(() => new Promise(() => {}), () => true, 25);
    writes++;
  })();
  await assert.rejects(operation, /タイムアウト/);
  assert.equal(writes, 0);
});

test('late prewrite token cannot authorize a subsequent save after deadline', async () => {
  let release, writes = 0;
  const operation = (async () => {
    await pinCandidateProfilePrewrite(() => new Promise(resolve => { release = resolve; }), () => true, 25);
    writes++;
  })();
  await assert.rejects(operation, /タイムアウト/);
  release(pinFor());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes, 0);
});

test('postwrite canonical read expires without launching another profile mutation', async () => {
  let reads = 0, writes = 0;
  await assert.rejects(readCandidateProfileAfterWrite({
    pinned: pinFor(),
    isCurrent: () => true,
    timeoutMs: 25,
    load: async () => { reads++; return new Promise(() => {}); },
  }), /タイムアウト/);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});
