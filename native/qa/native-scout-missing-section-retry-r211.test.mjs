import assert from 'node:assert/strict';
import test from 'node:test';
import { retryMissingScoutSections } from '../src/lib/scoutMissingSectionRetry.ts';

const entry = (overrides = {}) => ({
  missing: { scouts: true, privacy: false, preferences: false },
  loadScouts: async () => ['synthetic-scout'],
  loadPrivacy: async () => ({ scout_opt_in: true }),
  loadPreferences: async () => ({ desired_prefectures: ['東京都'] }),
  isCurrent: () => true,
  ...overrides,
});

test('only missing Scout inbox is retried, preserving already verified privacy/preference drafts', async () => {
  const called = [];
  const result = await retryMissingScoutSections(entry({
    loadScouts: async () => { called.push('scouts'); return ['synthetic-scout']; },
    loadPrivacy: async () => { called.push('privacy'); throw Error('should not read'); },
    loadPreferences: async () => { called.push('preferences'); throw Error('would overwrite unsaved edits'); },
  }));
  assert.deepEqual(called, ['scouts']);
  assert.deepEqual(result, {
    scouts: { status: 'fulfilled', value: ['synthetic-scout'] },
    privacy: { status: 'skipped' },
    preferences: { status: 'skipped' },
  });
});

test('partial failure preserves independently recovered privacy while preferences remain unknown', async () => {
  const result = await retryMissingScoutSections(entry({
    missing: { scouts: false, privacy: true, preferences: true },
    loadPrivacy: async () => ({ scout_opt_in: false }),
    loadPreferences: async () => { throw Error('offline'); },
  }));
  assert.deepEqual(result?.scouts, {status:'skipped'});
  assert.deepEqual(result?.privacy, {status:'fulfilled', value:{scout_opt_in:false}});
  assert.deepEqual(result?.preferences, {status:'rejected'});
});

test('skipped panels are not called or falsely marked freshly verified', async () => {
  let calls = 0;
  const result = await retryMissingScoutSections(entry({
    missing: { scouts: false, privacy: false, preferences: false },
    loadScouts: async () => { calls++; return []; },
  }));
  assert.equal(calls, 0);
  assert.equal(result?.scouts.status, 'skipped');
});

test('revoked owner before start prevents any private load', async () => {
  let calls = 0;
  const result = await retryMissingScoutSections(entry({
    isCurrent: () => false,
    loadScouts: async () => { calls++; return []; },
  }));
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test('session switch before queued read stops RPC and returns no cross-owner snapshot', async () => {
  let allowed = true;
  let calls = 0;
  const promise = retryMissingScoutSections(entry({
    isCurrent: () => allowed,
    loadScouts: async () => { calls++; return []; },
  }));
  allowed = false;
  assert.equal(await promise, null);
  assert.equal(calls, 0);
});

test('session revoked after RPC begins cannot publish late scout result', async () => {
  let finish;
  let allowed = true;
  const promise = retryMissingScoutSections(entry({
    isCurrent: () => allowed,
    loadScouts: () => new Promise(resolve => { finish = resolve; }),
    timeoutMs: 100,
  }));
  await new Promise(resolve => setImmediate(resolve));
  allowed = false;
  finish(['old-candidate-scout']);
  assert.equal(await promise, null);
});

test('one timed-out private read cannot hide another recovered panel', async () => {
  const result = await retryMissingScoutSections(entry({
    missing: { scouts: true, privacy: true, preferences: false },
    loadScouts: () => new Promise(() => {}),
    loadPrivacy: async () => ({ scout_opt_in: true }),
    timeoutMs: 12,
  }));
  assert.equal(result?.scouts.status, 'rejected');
  assert.deepEqual(result?.privacy, {status:'fulfilled', value:{scout_opt_in:true}});
  assert.equal(result?.preferences.status, 'skipped');
});

test('late rejected read is observed without falsifying recovery success', async () => {
  let fail;
  const result = await retryMissingScoutSections(entry({
    loadScouts: () => new Promise((_, reject) => { fail = reject; }),
    timeoutMs: 12,
  }));
  assert.equal(result?.scouts.status, 'rejected');
  fail(Error('synthetic late RPC failure'));
  await new Promise(resolve => setImmediate(resolve));
});
