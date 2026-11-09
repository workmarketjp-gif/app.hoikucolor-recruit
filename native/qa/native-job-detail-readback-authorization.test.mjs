import assert from 'node:assert/strict';
import test from 'node:test';
import { homeInlineApplyDecision } from '../src/lib/homeApplyDecision.ts';
import { jobDetailReadbackRecovery } from '../src/lib/jobDetailReadbackRecovery.ts';

const JOB_ID = '0B4ECFF0-1441-458B-83CA-4412AE2B59C1';
const APP_ID = 'd2f77b09-2fb0-4aad-b112-97a427eae02a';
const NOW = Date.parse('2026-11-10T00:00:00Z');
const job = { id: JOB_ID.toLowerCase(), is_open: true, is_external: false, can_apply_direct: true, closing_at: null };
const profile = { name: 'テスト求職者' };

test('candidate-owned canonical application is readable across valid UUID lettercase', () => {
  const decision = homeInlineApplyDecision(job, profile, [{ id: APP_ID, job_id: JOB_ID }], JOB_ID, NOW);
  assert.deepEqual(decision, { kind: 'existing', applicationId: APP_ID });
  assert.deepEqual(jobDetailReadbackRecovery(job, profile, [{ id: APP_ID, job_id: JOB_ID }], JOB_ID, true, true, NOW), {
    existingApplicationId: APP_ID, quarantine: false,
  });
});

test('closed job preserves confirmed existing application, but blocks a new submission', () => {
  assert.equal(homeInlineApplyDecision({ ...job, is_open: false }, profile, [], JOB_ID, NOW).kind, 'unavailable');
  assert.equal(homeInlineApplyDecision({ ...job, is_open: false }, profile, [{ id: APP_ID, job_id: JOB_ID }], JOB_ID, NOW).kind, 'existing');
});

test('malformed matching application does not release an ambiguous submission quarantine', () => {
  assert.deepEqual(jobDetailReadbackRecovery(job, profile, [{ id: 'invalid-id', job_id: JOB_ID }], JOB_ID, false, true, NOW), {
    existingApplicationId: null, quarantine: true,
  });
  assert.equal(homeInlineApplyDecision(job, profile, [{ id: 'invalid-id', job_id: JOB_ID }], JOB_ID, NOW).kind, 'unavailable');
});

test('empty readback cannot release a durable pending submission marker', () => {
  assert.deepEqual(jobDetailReadbackRecovery(job, profile, [], JOB_ID, true, false, NOW), {
    existingApplicationId: null, quarantine: true,
  });
});

test('fresh canonical open job with no pending marker allows document selection', () => {
  assert.equal(homeInlineApplyDecision(job, profile, [], JOB_ID, NOW).kind, 'documents');
  assert.deepEqual(jobDetailReadbackRecovery(job, profile, [], JOB_ID, false, false, NOW), {
    existingApplicationId: null, quarantine: false,
  });
});

test('invalid closing date is not authoritative evidence of an open vacancy', () => {
  assert.equal(homeInlineApplyDecision({ ...job, closing_at: 'invalid-date' }, profile, [], JOB_ID, NOW).kind, 'unavailable');
});
