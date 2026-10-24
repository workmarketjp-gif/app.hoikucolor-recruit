/**
 * Hoiku Color: opt-in, strictly read-only anonymous HTTPS catalog smoke probe.
 * Uses the real public v2 RPC and view only. No account tokens or service-role keys.
 * Never prints job text, IDs, request headers, or environment values.
 *
 * Run only when an independent test environment can access the public Supabase
 * REST origin: HC_SUPABASE_URL=... HC_SUPABASE_PUBLISHABLE_KEY=...
 *   node qa/anonymous-http-smoke.mjs
 * Set HC_REQUIRE_PUBLIC_JOBS=1 when the live feed is expected to be nonempty.
 * This script is NOT an MCP Inspector or ChatGPT end-to-end test.
 */
import { pathToFileURL } from 'node:url';
import { getPublicChildcareJob, listPublicChildcareJobFilters, searchPublicChildcareJobs } from '../public-jobs.mjs';

const SAFE_JOB_FIELDS = new Set([
  'id', 'title', 'facility_name', 'organization_name', 'facility_type', 'prefecture',
  'city', 'employment_type', 'salary_type', 'salary_min', 'salary_max', 'salary_note',
  'required_qualification', 'description', 'published_at', 'closing_at',
  'is_external', 'source_name', 'source_last_verified_at',
  'has_verified_workplace_metrics', 'url',
]);

function checkProjection(job, checkedAt) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) throw new Error('PUBLIC_PROJECTION_INVALID');
  if (Object.keys(job).some(key => !SAFE_JOB_FIELDS.has(key))) throw new Error('PUBLIC_PROJECTION_UNEXPECTED_FIELD');
  if (typeof job.id !== 'string' || !/^https:\/\/hoikucolor\.jp\/jobs\/[0-9a-f-]+$/i.test(job.url) ||
      !job.url.endsWith(`/${job.id}`)) throw new Error('PUBLIC_PROJECTION_LINK_INVALID');
  if (job.is_external !== true && job.is_external !== false) throw new Error('PUBLIC_PROJECTION_SOURCE_INVALID');
  if (job.is_external && (!job.source_last_verified_at ||
      checkedAt - Date.parse(job.source_last_verified_at) > 12 * 60 * 60 * 1000)) {
    throw new Error('PUBLIC_PROJECTION_STALE_EXTERNAL');
  }
}

export async function runAnonymousHttpSmoke({ config, requirePublished = false } = {}) {
  // Static tool parameters cannot change the source URL, privileges or RPC.
  let [search, facets] = await Promise.all([
    searchPublicChildcareJobs({ limit: 5, offset: 0 }, config),
    listPublicChildcareJobFilters({}, config),
  ]);
  // The deployed public SQL may expose a wider source-recency window than the
  // MCP's strict 12-hour gate. A first page of stale sources is NOT proof of
  // an empty live catalog. Follow only forward raw offsets, with a hard cap
  // of four MCP search calls (at most 16 bounded public RPC windows).
  const visitedOffsets = new Set([0]);
  for (let attempt = 1;
    attempt < 4 && search.jobs.length === 0 &&
    search.possible_more_source_rows && search.next_offset !== null;
    attempt++) {
    const next = search.next_offset;
    if (!Number.isSafeInteger(next) || next <= search.offset || visitedOffsets.has(next)) {
      throw new Error('PUBLIC_CATALOG_PAGINATION_INVALID');
    }
    visitedOffsets.add(next);
    search = await searchPublicChildcareJobs({ limit: 5, offset: next }, config);
  }
  if (!Array.isArray(search.jobs) || search.jobs.length > 5 ||
      !Array.isArray(facets.prefectures) || !Array.isArray(facets.employment_types)) {
    throw new Error('PUBLIC_CATALOG_RESULT_INVALID');
  }
  const checkedAt = typeof config?.now === 'function' ? config.now() : Date.now();
  search.jobs.forEach(job => checkProjection(job, checkedAt));
  if (requirePublished && search.jobs.length === 0) {
    // Never label an incomplete scan of a wider source window as definitive
    // absence of published jobs. This is a failed acceptance, not a PASS.
    throw new Error(search.possible_more_source_rows
      ? 'PUBLIC_CATALOG_INCONCLUSIVE' : 'PUBLIC_CATALOG_EMPTY');
  }
  if (Number.isInteger(search.reported_total) && search.reported_total < search.jobs.length) {
    throw new Error('PUBLIC_CATALOG_TOTAL_INCONSISTENT');
  }
  const detail = search.jobs.length
    ? await getPublicChildcareJob({ job_id: search.jobs[0].id }, config)
    : null;
  if (detail?.job) {
    checkProjection(detail.job, checkedAt);
    if (detail.job.id !== search.jobs[0].id) throw new Error('PUBLIC_CATALOG_DETAIL_MISMATCH');
  }
  // Strict live acceptance must prove that the same published listing is
  // still publicly readable by detail. A mid-read closure may be valid
  // operationally, but it is not evidence of a completed positive E2E flow.
  if (requirePublished && detail?.job == null) throw new Error('PUBLIC_CATALOG_DETAIL_UNAVAILABLE');
  // Aggregate evidence only: never log titles, IDs, names, snippets or tokens.
  return {
    mode: 'anonymous_read_only_rest',
    search_count: search.jobs.length,
    reported_total: search.reported_total,
    prefecture_filter_count: facets.prefectures.length,
    employment_filter_count: facets.employment_types.length,
    detail_state: detail === null ? 'not_attempted' : detail.job ? 'found' : 'disappeared',
    transport: 'https_rest_not_mcp',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const summary = await runAnonymousHttpSmoke({
      config: {
        supabaseUrl: process.env.HC_SUPABASE_URL,
        publishableKey: process.env.HC_SUPABASE_PUBLISHABLE_KEY,
      },
      requirePublished: process.env.HC_REQUIRE_PUBLIC_JOBS === '1',
    });
    process.stdout.write(JSON.stringify(summary) + '\n');
  } catch (error) {
    const code = typeof error?.message === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.message)
      ? error.message : 'UNEXPECTED_PROBE_FAILURE';
    process.stderr.write(`HC_ANON_HTTP_SMOKE_FAILED: ${code}\n`);
    process.exitCode = 1;
  }
}
