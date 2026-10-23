import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicChildcareJob } from '../public-jobs.mjs';

// A public view or intermediary that ignores the requested UUID must not
// silently substitute another facility's listing in an exact job lookup.
const id = '11111111-1111-4111-8111-000000000091';
const other = '11111111-1111-4111-8111-000000000092';
const row = {
  id, title: '公開求人', is_external: false,
  published_at: '2026-10-17T00:00:00Z', closing_at: null,
  internal_selection_memo: 'SENSITIVE_MARKER_DO_NOT_EMIT',
};
const config = rows => ({
  supabaseUrl: 'https://fixture.supabase.co',
  publishableKey: 'sb_publishable_fixture',
  now: () => Date.parse('2026-10-18T00:00:00Z'),
  fetcher: async () => Response.json(rows),
});

test('exact public job detail rejects an unrelated source UUID', async () => {
  await assert.rejects(
    getPublicChildcareJob({ job_id: id }, config([{ ...row, id: other }])),
    /PUBLIC_JOB_SOURCE_ROW_MISMATCH/,
  );
});

test('exact public job detail rejects multiple source rows', async () => {
  await assert.rejects(
    getPublicChildcareJob({ job_id: id }, config([row, row])),
    /PUBLIC_JOB_SOURCE_ROW_MISMATCH/,
  );
});

test('exact public job detail rejects missing source UUID', async () => {
  await assert.rejects(
    getPublicChildcareJob({ job_id: id }, config([{ ...row, id: null }])),
    /PUBLIC_JOB_SOURCE_ROW_MISMATCH/,
  );
});

test('exact public job detail accepts case-insensitive UUIDs without leaking unknown fields', async () => {
  const result = await getPublicChildcareJob({ job_id: id.toUpperCase() }, config([row]));
  assert.equal(result.job.id, id);
  assert.ok(!JSON.stringify(result).includes('SENSITIVE_MARKER_DO_NOT_EMIT'));
});

test('exact public job detail preserves empty and expired outcomes', async () => {
  assert.equal((await getPublicChildcareJob({ job_id: id }, config([]))).job, null);
  assert.equal((await getPublicChildcareJob({ job_id: id }, config([
    { ...row, closing_at: '2026-10-17T12:00:00Z' },
  ]))).job, null);
});
