import test from 'node:test';
import assert from 'node:assert/strict';
import { homeJobAvailability } from '../src/lib/homeFeaturedDetails.ts';
import { homeInlineApplyDecision, isExplicitlyDirectJob } from '../src/lib/homeApplyDecision.ts';
import { canPreopenHomeDocuments } from '../src/lib/homeDirectApplyEntry.ts';

// All data below is synthetic, matching the two distinct canonical v2 RPC projections:
// search/get-job v2 return no is_open; saved-jobs-with-status v2 returns is_open.
const NOW = Date.parse('2026-11-10T01:00:00Z');
const JOB_ID = '11111111-2222-4333-8444-555555555555';
const INTERNAL_V2 = { id: JOB_ID, is_external: false, can_apply_direct: true, source_kind: 'hoiku_color', closing_at: null };
const EXTERNAL_V2 = { ...INTERNAL_V2, is_external: true, can_apply_direct: false, source_kind: 'hellowork' };
const PROFILE = { name: '合成テスト候補者' };
const decide = (j) => homeInlineApplyDecision(j, PROFILE, [], JOB_ID, NOW);

test('canonical search/get-job v2 internal rows omit is_open yet support open direct-apply navigation', () => {
  assert.equal(homeJobAvailability(INTERNAL_V2, NOW), 'open');
  assert.equal(isExplicitlyDirectJob(INTERNAL_V2), true);
  assert.equal(decide(INTERNAL_V2).kind, 'documents');
  assert.equal(canPreopenHomeDocuments('1', decide(INTERNAL_V2), homeJobAvailability(INTERNAL_V2, NOW), false), true);
});

test('canonical search v2 external rows can show valid open status but cannot direct-apply', () => {
  assert.equal(homeJobAvailability(EXTERNAL_V2, NOW), 'open');
  assert.equal(isExplicitlyDirectJob(EXTERNAL_V2), false);
  assert.equal(decide(EXTERNAL_V2).kind, 'unavailable');
  assert.equal(canPreopenHomeDocuments('1', decide(EXTERNAL_V2), homeJobAvailability(EXTERNAL_V2, NOW), false), false);
});

test('saved-job explicit closed flag takes priority; explicit open allows a saved row', () => {
  assert.equal(homeJobAvailability({ ...INTERNAL_V2, is_open: false }, NOW), 'closed');
  assert.equal(homeJobAvailability({ ...INTERNAL_V2, source_kind: null, is_open: true }, NOW), 'open');
  assert.equal(homeJobAvailability({ ...EXTERNAL_V2, is_open: false }, NOW), 'closed');
});

test('missing or malformed source identity never turns a bare row into an open vacancy', () => {
  for (const row of [
    { closing_at: null },
    { ...INTERNAL_V2, source_kind: undefined },
    { ...INTERNAL_V2, source_kind: 'manual' },
    { ...INTERNAL_V2, is_external: undefined },
    { ...INTERNAL_V2, can_apply_direct: undefined },
    { ...EXTERNAL_V2, source_kind: 'hoiku_color' },
    { ...EXTERNAL_V2, source_kind: '' },
    { ...INTERNAL_V2, is_open: 'true' },
    { ...INTERNAL_V2, is_open: null },
  ]) {
    assert.equal(homeJobAvailability(row, NOW), 'unknown');
    if ('source_kind' in row || 'is_external' in row || 'can_apply_direct' in row || 'is_open' in row) {
      assert.equal(decide({ ...INTERNAL_V2, ...row }).kind, 'unavailable');
    }
  }
});

test('canonical open feed still respects explicit/invalid/past/future closing dates', () => {
  assert.equal(homeJobAvailability({ ...INTERNAL_V2, closing_at: 'invalid' }, NOW), 'unknown');
  assert.equal(homeJobAvailability({ ...INTERNAL_V2, closing_at: '' }, NOW), 'unknown');
  assert.equal(homeJobAvailability({ ...INTERNAL_V2, closing_at: '2026-11-10T00:00:00Z' }, NOW), 'closed');
  assert.equal(homeJobAvailability({ ...INTERNAL_V2, closing_at: '2026-11-10T02:00:00Z' }, NOW), 'open');
  assert.equal(homeJobAvailability(INTERNAL_V2, Number.NaN), 'unknown');
  assert.equal(canPreopenHomeDocuments('1', decide(INTERNAL_V2), 'unknown', false), false);
});
