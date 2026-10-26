import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPublicChildcareJobs, getPublicChildcareJob } from '../public-jobs.mjs';

// A public SQL view or cached RPC response may contain a scheduled/just-closed
// job. The model-visible projection must independently enforce exact timestamps.
const now = Date.parse('2026-10-24T00:00:00.000Z');
const id = '11111111-1111-4111-8111-000000000094';
const base = {
  id, title: '保育士（公開確認用）', is_external: false,
  published_at: '2026-10-23T23:59:59.999Z',
  closing_at: null, source_last_verified_at: null,
};
function source(row) {
  return {
    now: () => now,
    supabaseUrl: 'https://fixture.supabase.co',
    publishableKey: 'sb_publishable_fixture',
    fetcher: async () => Response.json([{ ...row, total_count: 1 }]),
  };
}
async function lookupBoth(row) {
  const config = source(row);
  const search = await searchPublicChildcareJobs({ limit: 10 }, config);
  const detail = await getPublicChildcareJob({ job_id: id }, config);
  return { search, detail };
}

test('internal future publication 1ms ahead never reaches anonymous search or detail', async () => {
  const result = await lookupBoth({ ...base, published_at: '2026-10-24T00:00:00.001Z' });
  assert.deepEqual(result.search.jobs, []);
  assert.equal(result.detail.job, null);
});

test('external future publication within former five-minute grace is also hidden', async () => {
  const result = await lookupBoth({
    ...base, is_external: true,
    published_at: '2026-10-24T00:04:00.000Z',
    source_last_verified_at: '2026-10-23T23:00:00.000Z',
  });
  assert.equal(result.search.returned, 0);
  assert.equal(result.detail.job, null);
});

test('publication exactly now is visible, while future publication is not', async () => {
  const result = await lookupBoth({ ...base, published_at: '2026-10-24T00:00:00.000Z' });
  assert.deepEqual(result.search.jobs.map(job => job.id), [id]);
  assert.equal(result.detail.job?.id, id);
});

test('a listing whose closing timestamp is exactly now is no longer published', async () => {
  const result = await lookupBoth({
    ...base, closing_at: '2026-10-24T00:00:00.000Z',
  });
  assert.equal(result.search.returned, 0);
  assert.equal(result.detail.job, null);
});

test('one millisecond before closing remains eligible', async () => {
  const result = await lookupBoth({
    ...base, closing_at: '2026-10-24T00:00:00.001Z',
  });
  assert.equal(result.search.returned, 1);
  assert.equal(result.detail.job?.id, id);
});
