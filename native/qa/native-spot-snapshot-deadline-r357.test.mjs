import assert from 'node:assert/strict';
import test from 'node:test';
import { readCandidateSpotSnapshotBounded } from '../src/lib/spotSnapshotRead.ts';

const owner = (ownerId = 'candidate-A', ownerSessionId = 'session-A', isCurrent = () => true) => ({
  ownerId, ownerSessionId, isCurrent,
});
const opts = (extra = {}) => ({
  pin: async () => owner(),
  readJobs: async () => [{ job_id: 'synthetic-job' }],
  readAssignments: async () => [{ assignment_id: 'synthetic-assignment' }],
  isCurrent: () => true,
  ownsPin: p => p.ownerId === 'candidate-A' && p.ownerSessionId === 'session-A',
  timeoutMs: 25,
  ...extra,
});

test('returns one canonical job-and-assignment pair for the same session', async () => {
  const result = await readCandidateSpotSnapshotBounded(opts());
  assert.deepEqual(result, { jobs: [{ job_id: 'synthetic-job' }], assignments: [{ assignment_id: 'synthetic-assignment' }] });
});

test('real empty arrays remain the only confirmed empty snapshot', async () => {
  assert.deepEqual(await readCandidateSpotSnapshotBounded(opts({ readJobs: async () => [], readAssignments: async () => [] })), { jobs: [], assignments: [] });
});

test('hanging Clerk token pin times out without launching either RPC', async () => {
  let calls = 0;
  await assert.rejects(readCandidateSpotSnapshotBounded(opts({
    pin: () => new Promise(() => {}),
    readJobs: async () => { calls++; return []; },
    readAssignments: async () => { calls++; return []; },
  })), /タイムアウト/);
  assert.equal(calls, 0);
});

test('hanging one canonical RPC times out, not a fabricated partial or empty snapshot', async () => {
  let assignments = 0;
  await assert.rejects(readCandidateSpotSnapshotBounded(opts({
    readJobs: () => new Promise(() => {}),
    readAssignments: async () => { assignments++; return []; },
  })), /タイムアウト/);
  assert.equal(assignments, 1);
});

test('a rejected assignment RPC rejects the whole snapshot, preserving privacy', async () => {
  await assert.rejects(readCandidateSpotSnapshotBounded(opts({
    readAssignments: async () => { throw new Error('synthetic denied'); },
  })), /synthetic denied/);
});

test('owner or session mismatch prevents both canonical RPC calls', async () => {
  let calls = 0;
  for (const wrong of [owner('candidate-B'), owner('candidate-A','session-B')]) {
    await assert.rejects(readCandidateSpotSnapshotBounded(opts({
      pin: async () => wrong,
      readJobs: async () => { calls++; return []; },
      readAssignments: async () => { calls++; return []; },
    })), /ログイン状態/);
  }
  assert.equal(calls, 0);
});

test('blur or account switch before queued token retrieval prevents pin call', async () => {
  let current = true;
  let pins = 0;
  let reads = 0;
  const operation = readCandidateSpotSnapshotBounded(opts({
    isCurrent: () => current,
    pin: async () => { pins++; return owner(); },
    readJobs: async () => { reads++; return []; },
  }));
  current = false;
  await assert.rejects(operation, /ログイン状態/);
  assert.equal(pins, 0);
  assert.equal(reads, 0);
});

test('blur between pin check and queued read prevents both RPC launches', async () => {
  let current = true;
  let calls = 0;
  await assert.rejects(readCandidateSpotSnapshotBounded(opts({
    ownsPin: p => { const allowed = current; current = false; return allowed; },
    isCurrent: () => current,
    readJobs: async () => { calls++; return []; },
    readAssignments: async () => { calls++; return []; },
  })), /ログイン状態/);
  assert.equal(calls, 0);
});

test('late canonical response is rejected after a session change', async () => {
  let current = true;
  let finishJobs;
  let finishAssignments;
  const operation = readCandidateSpotSnapshotBounded(opts({
    isCurrent: () => current,
    readJobs: () => new Promise(resolve => { finishJobs = resolve; }),
    readAssignments: () => new Promise(resolve => { finishAssignments = resolve; }),
  }));
  for (let i = 0; i < 10 && !finishJobs; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof finishJobs, 'function');
  current = false;
  finishJobs([{ job_id: 'candidate-A-only' }]);
  finishAssignments([]);
  await assert.rejects(operation, /ログイン状態/);
});

test('late Clerk completion after timeout never launches a private RPC', async () => {
  let finishPin;
  let calls = 0;
  const operation = readCandidateSpotSnapshotBounded(opts({
    pin: () => new Promise(resolve => { finishPin = resolve; }),
    readJobs: async () => { calls++; return []; },
    readAssignments: async () => { calls++; return []; },
  }));
  await assert.rejects(operation, /タイムアウト/);
  finishPin(owner());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
});

test('late canonical rejection after deadline is observed, not unhandled', async () => {
  let rejectJobs;
  const operation = readCandidateSpotSnapshotBounded(opts({
    readJobs: () => new Promise((_resolve, reject) => { rejectJobs = reject; }),
    readAssignments: async () => [],
  }));
  await assert.rejects(operation, /タイムアウト/);
  rejectJobs(new Error('late synthetic network failure'));
  await new Promise(resolve => setImmediate(resolve));
});
