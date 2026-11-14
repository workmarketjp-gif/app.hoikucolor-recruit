import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCandidateComparisonBounded } from '../src/lib/comparisonCanonicalRead.ts';

function fixture(overrides = {}) {
  let current = true;
  const calls = [];
  const pin = { owner: 'candidate-A', isCurrent: () => current };
  const defaults = {
    pin: async () => { calls.push('pin'); return pin; },
    ownsPin: (p) => p.owner === 'candidate-A',
    isCurrent: () => current,
    readJobs: async (p) => { calls.push(`jobs:${p.owner}`); return [{ id: 'published-job' }]; },
    readProfile: async (p) => { calls.push(`profile:${p.owner}`); return { name: 'Synthetic' }; },
    readPreferences: async (p) => { calls.push(`preferences:${p.owner}`); return { region: 'Synthetic' }; },
    timeoutMs: 20,
  };
  return { opts: { ...defaults, ...overrides }, calls, revoke: () => { current = false; } };
}

test('one pinned identity reads jobs, profile and preferences, never a second token', async () => {
  const f = fixture();
  const result = await readCandidateComparisonBounded(f.opts);
  assert.deepEqual(result.jobs, [{ id: 'published-job' }]);
  assert.deepEqual(result.profile, { name: 'Synthetic' });
  assert.deepEqual(result.preferences, { region: 'Synthetic' });
  assert.equal(f.calls.filter((x) => x === 'pin').length, 1);
  assert.equal(f.calls.length, 4);
});

test('hung Clerk token times out without starting any private RPC', async () => {
  const f = fixture({ pin: () => new Promise(() => {}) });
  await assert.rejects(readCandidateComparisonBounded(f.opts), /タイムアウト/);
  assert.deepEqual(f.calls, []);
});

test('hung canonical preferences read fails the whole snapshot instead of returning empty data', async () => {
  const f = fixture({ readPreferences: () => new Promise(() => {}) });
  await assert.rejects(readCandidateComparisonBounded(f.opts), /タイムアウト/);
  assert.equal(f.calls.includes('pin'), true);
});

test('a canonical profile failure is not hidden by a successful published-job list', async () => {
  const f = fixture({ readProfile: async () => { throw new Error('private read failed'); } });
  await assert.rejects(readCandidateComparisonBounded(f.opts), /private read failed/);
});

test('session revocation during in-flight fetch blocks publishing the old snapshot', async () => {
  let resolveJobs;
  const f = fixture({ readJobs: () => new Promise((resolve) => { resolveJobs = resolve; }) });
  const pending = readCandidateComparisonBounded(f.opts);
  await new Promise((resolve) => setImmediate(resolve));
  f.revoke();
  resolveJobs([{ id: 'old-owner-job' }]);
  await assert.rejects(pending, /ログイン状態/);
});

test('an invalid owner never starts private reads', async () => {
  const f = fixture({ ownsPin: () => false });
  await assert.rejects(readCandidateComparisonBounded(f.opts), /ログイン状態/);
  assert.deepEqual(f.calls, ['pin']);
});

test('late resolution after deadline cannot publish the expired snapshot or retry the read', async () => {
  let resolveJobs;
  let attempts = 0;
  const f = fixture({ readJobs: () => { attempts++; return new Promise((resolve) => { resolveJobs = resolve; }); } });
  const result = readCandidateComparisonBounded(f.opts);
  await assert.rejects(result, /タイムアウト/);
  resolveJobs([{ id: 'late' }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
});
