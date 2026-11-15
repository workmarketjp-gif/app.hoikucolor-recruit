import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmSavedCareer, confirmDeletedCareer } from '../src/lib/careerPostwriteReadback.ts';
import { careerMutationFailure } from '../src/lib/careerMutationRecovery.ts';

const submitted = Object.freeze({ current_monthly_salary: 275000, current_annual_holidays: 120, tolerable_salary_drop: null, desired_annual_holidays: 125, scenario: 'balance', salary_weight: 55 });

// These tests exercise the same real-source readback helper called after the
// canonical RPC. A simulated client never sends a real candidate mutation.
test('save readback returns only matching canonical fields', async () => {
  let reads = 0;
  const saved = await confirmSavedCareer(async () => { reads++; return { ...submitted }; }, submitted, 20);
  assert.equal(reads, 1);
  assert.deepEqual(saved, submitted);
});

test('save rejects stale values rather than claiming the write succeeded', async () => {
  await assert.rejects(confirmSavedCareer(async () => ({ ...submitted, salary_weight: 40 }), submitted, 20), /保存した内容を確認できません/);
});

test('save rejects missing canonical row', async () => {
  await assert.rejects(confirmSavedCareer(async () => null, submitted, 20), /保存した内容を確認できません/);
});

test('delete accepts only a canonical null readback', async () => {
  let reads = 0;
  await confirmDeletedCareer(async () => { reads++; return null; }, 20);
  assert.equal(reads, 1);
  await assert.rejects(confirmDeletedCareer(async () => ({ ...submitted }), 20), /削除できません/);
});

for (const operation of ['save', 'delete']) {
  test(`${operation}: stalled post-write readback times out and keeps write status ambiguous`, async () => {
    let reads = 0;
    const never = () => { reads++; return new Promise(() => {}); };
    const result = operation === 'save'
      ? confirmSavedCareer(never, submitted, 8)
      : confirmDeletedCareer(never, 8);
    await assert.rejects(result, /タイムアウト/);
    assert.equal(reads, 1);
    assert.equal(careerMutationFailure(true).requiresCanonicalReload, true);
  });
}

test('late readback cannot change a settled timed-out result', async () => {
  let resolve;
  const pending = confirmSavedCareer(() => new Promise(r => { resolve = r; }), submitted, 8);
  await assert.rejects(pending, /タイムアウト/);
  resolve({ ...submitted });
  await Promise.resolve();
  // A fresh explicit read is still required; a late response is not success.
  assert.equal(careerMutationFailure(true).requiresCanonicalReload, true);
});

test('postwrite helper never calls any write function or retries read on failure', async () => {
  let readCount = 0;
  await assert.rejects(confirmDeletedCareer(async () => { readCount++; throw new Error('private token secret'); }, 20), /private token secret/);
  assert.equal(readCount, 1);
  assert.doesNotMatch(careerMutationFailure(true).notice, /private token secret/);
});
