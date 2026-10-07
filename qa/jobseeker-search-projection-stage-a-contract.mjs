import fs from 'node:fs';

const foundation = fs.readFileSync(
  'supabase/migrations/20261007134500_hc_jobseeker_search_projection_stage_a_foundation.sql',
  'utf8',
);
const sync = fs.readFileSync(
  'supabase/migrations/20261007134600_hc_jobseeker_search_projection_stage_a_sync.sql',
  'utf8',
);
const helpers = fs.readFileSync(
  'supabase/migrations/20261007134700_hc_jobseeker_search_projection_stage_a_helpers.sql',
  'utf8',
);
const all = [foundation, sync, helpers].join('\n');

const checks = [
  ['projection is private', foundation.includes('hc_feed_private.jobseeker_search_projection')],
  ['projection excludes raw source payload', !foundation.match(/source_payload\s+(json|jsonb)/i)],
  ['trigram index exists', foundation.includes('extensions.gin_trgm_ops')],
  ['covering rank/filter indexes exist', foundation.includes('hc_jobseeker_search_projection_rank_idx') && foundation.includes('hc_jobseeker_search_projection_filter_rank_idx')],
  ['external freshness remains dynamic', helpers.includes("source_last_verified_at >= now() - interval '12 hours'")],
  ['external expiry remains dynamic', helpers.includes('search_valid_until')],
  ['operator publication gate remains enforced', helpers.includes('publication_enabled = true')],
  ['literal keyword helper escapes LIKE wildcards', helpers.includes('hc_jobseeker_contains_pattern') && helpers.includes("escape E'\\\\'")],
  ['keyword and no-keyword plans are split', helpers.includes('hc_jobseeker_search_projection_no_keyword_v1') && helpers.includes('hc_jobseeker_search_projection_keyword_v1')],
  ['facets have a projection benchmark helper', helpers.includes('hc_jobseeker_job_search_facets_projection_v1')],
  ['external sync trigger exists', sync.includes('hc_jobseeker_search_projection_sync_external')],
  ['canonical sync trigger exists', sync.includes('hc_jobseeker_search_projection_sync_canonical')],
  ['HO/HF profile sync triggers exist', sync.includes('sync_workplace') && sync.includes('sync_finance')],
  ['unchanged external refresh has freshness-only fast path', sync.includes('source_content_hash') && sync.includes('source_parser_version') && sync.includes('source_last_verified_at = s.source_last_verified_at')],
  ['Stage A does not replace production search RPC', !all.match(/create\s+or\s+replace\s+function\s+public\.hc_jobseeker_search_jobs_v2/i)],
  ['Stage A does not replace production facets RPC', !all.match(/create\s+or\s+replace\s+function\s+public\.hc_jobseeker_job_search_facets_v2/i)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} Stage A search projection contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} Stage A search projection contract checks passed.`);
