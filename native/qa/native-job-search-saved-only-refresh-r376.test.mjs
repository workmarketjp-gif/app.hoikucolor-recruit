import assert from 'node:assert/strict';
import test from 'node:test';
import { readCandidateSavedIdsOnly } from '../src/lib/jobSearchSavedOnlyRefresh.ts';

const jobId = 'c5f5cf4b-6eb1-45e0-9366-8c23ed582fe3';
const pin = () => Promise.resolve({ ownerId: 'candidate-A', sessionId: 'session-1', isCurrent: () => true });
const make = (patch = {}) => ({
  pin,
  readSavedIds: async () => [jobId],
  isCurrent: () => true,
  ownsPin: (pinned) => pinned.ownerId === 'candidate-A' && pinned.sessionId === 'session-1',
  ...patch,
});

test('confirmed saved-ID-only recovery reads authoritative IDs with one candidate pin', async () => {
  let pins = 0;
  let readCount = 0;
  const result = await readCandidateSavedIdsOnly(make({
    pin: async () => { pins += 1; return pin(); },
    readSavedIds: async () => { readCount += 1; return [jobId]; },
  }));
  assert.deepEqual(result.value, [jobId]);
  assert.equal(pins, 1);
  assert.equal(readCount, 1);
  assert.equal(result.pinned.ownerId, 'candidate-A');
});

test('authoritative empty list is distinct from unreadable saved state', async () => {
  assert.deepEqual((await readCandidateSavedIdsOnly(make({ readSavedIds: async () => [] }))).value, []);
  assert.equal((await readCandidateSavedIdsOnly(make({ readSavedIds: async () => { throw Error('network'); } }))).value, null);
});

test('malformed and duplicate saved-ID lists never enable a heart', async () => {
  assert.equal((await readCandidateSavedIdsOnly(make({ readSavedIds: async () => ['bad-id'] }))).value, null);
  assert.equal((await readCandidateSavedIdsOnly(make({ readSavedIds: async () => [jobId, jobId.toUpperCase()] }))).value, null);
});

test('lost authorization before token pin does not invoke candidate/private RPC', async () => {
  let pinCalls = 0;
  let rpcCalls = 0;
  await assert.rejects(readCandidateSavedIdsOnly(make({
    isCurrent: () => false,
    pin: async () => { pinCalls += 1; return pin(); },
    readSavedIds: async () => { rpcCalls += 1; return []; },
  })));
  assert.equal(pinCalls, 0);
  assert.equal(rpcCalls, 0);
});

test('wrong candidate/session pin is rejected without reading saved IDs', async () => {
  let rpcCalls = 0;
  await assert.rejects(readCandidateSavedIdsOnly(make({
    pin: async () => ({ ownerId: 'candidate-A', sessionId: 'session-2', isCurrent: () => true }),
    readSavedIds: async () => { rpcCalls += 1; return [jobId]; },
  })));
  assert.equal(rpcCalls, 0);
});

test('session lost during saved-ID read rejects late response', async () => {
  let current = true;
  let complete;
  const pending = readCandidateSavedIdsOnly(make({
    isCurrent: () => current,
    readSavedIds: () => new Promise((resolve) => { complete = resolve; }),
  }));
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  current = false;
  complete([jobId]);
  await assert.rejects(pending);
});

test('a timed-out saved-only read returns unknown; its late resolution cannot overwrite readback', async () => {
  let complete;
  const result = await readCandidateSavedIdsOnly(make({
    savedIdsDeadlineMs: 2,
    readSavedIds: () => new Promise((resolve) => { complete = resolve; }),
  }));
  assert.equal(result.value, null);
  complete([jobId]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.value, null);
});
