// Hello Work data-quality contract: structured annual holidays / occupation, fair re-verification,
// credential lock-down. Source-text checks (no database needed), same style as the other contracts.
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const strip = (sql) => sql.replace(/^\s*--.*$/gm, '');
const bi = strip(read('supabase/migrations/20261023000628_hc_bi_reader_secret_columns_lockdown_v1.sql'));
const structure = strip(read('supabase/migrations/20261023001200_hc_hellowork_structured_fields_v1.sql'));
const reverify = strip(read('supabase/migrations/20261023001450_hc_hellowork_fair_reverify_v1.sql'));
const ops = strip(read('supabase/ops/hellowork-fair-reverify-cron.sql'));
const importer = read('supabase/functions/hc-hellowork-import/index.ts');

function assert(condition, message) {
  if (!condition) {
    console.error(`hellowork-structured-data-contract: ${message}`);
    process.exit(1);
  }
}

// --- credential lock-down
assert(bi.includes("'sync_secret', 'sync_lease_token'") && bi.includes("'access_token'") && bi.includes("'expo_push_token'"), 'credential columns must be excluded');
assert(bi.includes('revoke select on public.%I from bi_reader') && bi.includes('grant select (%s) on public.%I to bi_reader'), 'bi_reader keeps column-level SELECT on the rest');
assert(bi.includes('alter default privileges for role postgres in schema public revoke select on tables from bi_reader'), 'new tables must not be granted to bi_reader automatically');
assert(!/grant (all|insert|update|delete)/i.test(bi), 'no write privileges for bi_reader');

// --- structured fields: explicit values only, deterministic, constrained
assert(structure.includes('annual_holidays_days smallint') && structure.includes("annual_holidays_basis in ('exact', 'minimum')"), 'annual holiday columns and basis constraint');
assert(structure.includes('annual_holidays_days between 50 and 200'), 'implausible annual holidays must be rejected by a constraint');
assert(structure.includes('年間休日(?:総?日?数)?(?:は|が|:|=|\\[|【|（|\\()?(\\d{2,3})'), 'only the 年間休日 label directly followed by a number may match');
assert(structure.includes("'程度', '前後', '~', 'ほど'") && structure.includes('(約|最低|最大|平均|およそ|おおよそ|概ね|目安)'), 'approximations and ranges are ambiguous, never numbers');
assert(!/週休|完全週休|\*\s*52|365\s*-/.test(structure.replace(/array\[[^\]]*\]/g, '').replace(/'[^']*週休[^']*'/g, '')), 'annual holidays must never be derived from weekly-holiday wording');
assert(structure.includes("'hellowork_field'") && structure.indexOf("'hellowork_field'") < structure.indexOf("'holidays_text'"), 'the page’s formal 年間休日数 field wins over text');
assert(structure.includes('HW_SELFTEST_AMBIGUOUS_STOPS') && structure.includes('HW_SELFTEST_NO_DERIVATION') && structure.includes('select hc_private.hw_structure_selftest_v1();'), 'the migration must run its own parser test vectors');
assert(structure.includes("'unknown'::text, '{}'::text[]") && structure.includes("'multiple'"), 'ambiguous occupation stays unknown / multiple, never defaulted to 保育士');
assert(!/description|required_qualification/.test(structure.split('hw_occupation_groups_from_title_v1')[1].split('$$;')[0] || ''), 'title classification must not read description text');
assert(structure.includes('before insert or update on public.hc_external_job_sources'), 'the trigger keeps every importer write structured');
for (const fn of ['hw_norm_v1', 'hw_annual_holidays_from_text_v1', 'hw_annual_holidays_v1', 'hw_occupation_v1', 'hw_prefecture_v1', 'hw_structure_trigger_v1', 'hw_structure_selftest_v1']) {
  assert(new RegExp(`revoke all on function hc_private\\.${fn}\\([^)]*\\) from public, anon, authenticated, service_role`).test(structure), `${fn} must not be callable by browser roles`);
}
assert(structure.includes('annual_holidays_days,\n    annual_holidays_basis,\n    occupation_group,\n    occupation_groups\n   FROM hc_external_job_sources e') || /online_self_apply_allowed,\s+annual_holidays_days,\s+annual_holidays_basis,\s+occupation_group,\s+occupation_groups\s+FROM hc_external_job_sources e/.test(structure), 'feed columns are appended after the existing ones');
assert(/last_verified_at >= \(now\(\) - '168:00:00'::interval\)/.test(structure), 'the 168-hour freshness condition must be unchanged');
assert(structure.includes("v_occ = any (occupation_groups)") && structure.includes("v_occ = any (p.occupation_groups)"), 'career aggregates filter on the structured occupation');

// --- fair re-verification
assert(reverify.includes('rn::numeric / pref_total') && reverify.includes('partition by coalesce(s.prefecture'), 'batch must be proportionally fair across prefectures');
assert(reverify.includes("s.last_verified_at < now() - interval '24 hours'") && reverify.includes('reverify_attempted_at'), 'recently verified jobs are skipped and failed URLs back off');
assert(!/last_verified_at\s*=/.test(reverify), 'the picker must never write last_verified_at');
assert(reverify.includes('revoke all on function public.hc_hellowork_pick_reverify_batch_v1(integer) from public, anon, authenticated') && reverify.includes('to service_role'), 'picker is service_role only');
assert(reverify.includes('s.public_republication_allowed') && reverify.includes('s.claimed_job_id is null'), 'only publicly republishable, unclaimed jobs are re-checked');

// --- importer
assert(importer.includes("'年間休日数'") && importer.includes('annual_holidays_field_text'), 'importer must store the formal 年間休日数 row as-is');
assert(!/annual_holidays_days\s*[:=]/.test(importer), 'the importer must not interpret annual holidays itself');
assert(importer.includes('HELLOWORK_TRANSIENT_HTTP_') && importer.includes('HELLOWORK_UNEXPECTED_PAGE'), 'throttled or overload pages must not change a job');
assert(importer.includes('class JobGoneError') && /markGone[\s\S]{0,400}source_status: 'removed', public_republication_allowed: false/.test(importer), 'a gone notice withdraws the job');
assert(!/markGone[\s\S]{0,400}title:/.test(importer), 'a gone notice must not overwrite stored content');
const lastVerifiedWrites = importer.match(/last_verified_at: +(?!string)/g) ?? [];
assert(lastVerifiedWrites.length === 2 && importer.includes('last_verified_at: fetchedAt') && importer.includes('last_verified_at: now'), 'last_verified_at is only written after a fetch of the official page');
assert(importer.includes('failing = urls.length >= 10 && errors.length * 2 >= urls.length') && importer.includes('REVERIFY_BACKOFF_MS'), 'failure backoff');
assert(importer.includes('hc_hellowork_pick_reverify_batch_v1') && importer.includes('REVERIFY_MAX_LIMIT = 50'), 'bounded fair batch');

// --- discovery: new postings are fetched, known fresh ones are not re-fetched
assert(importer.includes('selectDiscoveryFetches(urls)') && importer.includes('DISCOVERY_SKIP_ACTIVE_MS = 12 * 60 * 60 * 1000'), 'discovery must skip detail requests for recently verified known postings');
assert(!/selectDiscoveryFetches[\s\S]{0,1500}last_verified_at:/.test(importer.split('async function importUrls')[0].split('async function selectDiscoveryFetches')[1] || ''), 'seeing a posting in a search list must not renew last_verified_at');
assert(importer.includes('const lastPage = urls.length < DISCOVERY_PAGE_SIZE'), 'paging must follow the search list, not the fetched subset');

// --- scheduler
assert(ops.includes("'*/5 * * * *'") && ops.includes('"limit":40') && ops.includes('"reverify":true'), 'steady-state cadence is 40 pages / 5 minutes');
assert(read('supabase/ops/hellowork-fair-reverify-cron.sql').includes('limit 50') && read('supabase/ops/hellowork-fair-reverify-cron.sql').includes('*/3 * * * *'), 'the temporary catch-up cadence must be documented');

// --- holiday boundary: 「N日以上」 and 「N日を超える」 are different conditions
const boundary = strip(read('supabase/migrations/20261023020217_hc_career_holiday_boundary_v1.sql'));
assert(boundary.includes('annual_holidays_days > p_holiday_floor') && boundary.includes('annual_holidays_days >= p_holiday_at_least'), 'strict and inclusive holiday conditions must stay separate');
assert(boundary.includes('drop function if exists public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text);'), 'the old overload must be dropped (PostgREST cannot resolve overloads)');
const scenarioFn = 'function public.hc_jobseeker_career_scenario_jobs_v1(text, text, text, integer, integer, integer, integer, text, integer)';
assert(boundary.includes(`revoke all on ${scenarioFn} from public, anon, authenticated, service_role;`) && boundary.includes(`grant execute on ${scenarioFn} to authenticated;`), 'authenticated only');


// Removal and transient HTTP observations must be attributable by a hashed source,
// without leaking raw job URLs/HTML, and logging failures must never change state.
const evidenceHelper = importer.split('async function logUpstreamEvidence(')[1]?.split(
  '// Hello Work answers HTTP 200')[0] ?? '';
assert(evidenceHelper.includes("event: 'hc_hellowork_upstream_evidence_v1'"), 'source evidence event must be versioned');
assert(evidenceHelper.includes('source_url_sha256: await sha256(url.toString())'), 'correlate incident evidence by hash only');
assert(evidenceHelper.includes('http_status: httpStatus') && evidenceHelper.includes('observed_at: observedAt'), 'include upstream code and observation time');
assert(evidenceHelper.includes("console.warn('HC_HELLOWORK_EVIDENCE_LOG_FAILED')"), 'logger failures must not affect job states');
assert(!/\bsource_url\s*:|\bhtml\s*:|\brequest_headers\s*:|\bdescription\s*:/.test(evidenceHelper),
  'no raw URL, response content, or job text in operational logs');
// Access-denied and client timeout responses are not proof of job withdrawal.
const protected4xxGuard = importer.indexOf('if ([401, 403, 408, 425].includes(response.status))');
assert(protected4xxGuard >= 0 && protected4xxGuard < importer.indexOf('const html = await response.text();'),
  'non-definitive 401/403/408/425 must be preserved before parsing or upserting');
assert(importer.includes("await logUpstreamEvidence(url, response.status, 'access_or_timeout_4xx', fetchedAt)"),
  '4xx access blocks and timeouts must leave content-free operational evidence');
assert(importer.includes("outcome: 'gone_notice' | 'rate_limited' | 'upstream_5xx' | 'access_or_timeout_4xx'"),
  'evidence outcome type must include access/timeout 4xx');
assert(importer.slice(protected4xxGuard, importer.indexOf('const html = await response.text();'))
  .includes('throw new Error(`HELLOWORK_TRANSIENT_HTTP_${response.status}`);'),
  'non-definitive 4xx must fail without changing existing rows');
assert(importer.includes("await logUpstreamEvidence(url, response.status, response.status === 429 ? 'rate_limited' : 'upstream_5xx', fetchedAt)"),
  'log 429/5xx before existing fail-preserving exception');
assert(importer.includes("await logUpstreamEvidence(url, response.status, 'gone_notice', fetchedAt)"),
  'log the HTTP 200 gone notice before withdrawing');

// HC_NONAUTHORITATIVE_HTTP_FIXTURE: exercise the actual early response guards
// with local synthetic status codes (no network, database writes or scraping).
assert(importer.includes("'non_authoritative_http'"), 'content-free evidence schema covers other non-2xx');
const guardStart = importer.indexOf('  // Authentication blocks');
const guardEnd = importer.indexOf('  const html = await response.text();', guardStart);
assert(guardStart >= 0 && guardEnd > guardStart, 'HTTP guards precede parsing');
const httpGuards = new Function('response', 'logUpstreamEvidence', 'url', 'fetchedAt',
  `return (async () => { ${importer.slice(guardStart, guardEnd)} return 'parse'; })();`);
// Only 2xx may advance to the parser. Official HTTP 200 gone notice is handled
// by the importer; HTTP 404/410 alone cannot overwrite/withdraw stored jobs.
for (const [status, expectedCode, expectedOutcome] of [
  [200, null, null],
  [201, null, null],
  [400, 'HELLOWORK_NONAUTHORITATIVE_HTTP_400', 'non_authoritative_http'],
  [401, 'HELLOWORK_TRANSIENT_HTTP_401', 'access_or_timeout_4xx'],
  [403, 'HELLOWORK_TRANSIENT_HTTP_403', 'access_or_timeout_4xx'],
  [404, 'HELLOWORK_NONAUTHORITATIVE_HTTP_404', 'non_authoritative_http'],
  [408, 'HELLOWORK_TRANSIENT_HTTP_408', 'access_or_timeout_4xx'],
  [410, 'HELLOWORK_NONAUTHORITATIVE_HTTP_410', 'non_authoritative_http'],
  [425, 'HELLOWORK_TRANSIENT_HTTP_425', 'access_or_timeout_4xx'],
  [429, 'HELLOWORK_TRANSIENT_HTTP_429', 'rate_limited'],
  [451, 'HELLOWORK_NONAUTHORITATIVE_HTTP_451', 'non_authoritative_http'],
  [500, 'HELLOWORK_TRANSIENT_HTTP_500', 'upstream_5xx'],
  [503, 'HELLOWORK_TRANSIENT_HTTP_503', 'upstream_5xx'],
]) {
  const events = [];
  let actualCode = null;
  try {
    const result = await httpGuards(
      { status, ok: status >= 200 && status < 300 },
      async (_url, recordedStatus, outcome) => events.push({ recordedStatus, outcome }),
      new URL('https://www.hellowork.mhlw.go.jp/kensaku/GECA110010.do'),
      '2026-10-29T00:00:00.000Z',
    );
    assert(result === 'parse', `status ${status} should reach the parser`);
  } catch (error) {
    actualCode = error.message;
  }
  assert(actualCode === expectedCode, `status ${status}: expected ${expectedCode}, got ${actualCode}`);
  assert(events.length === (expectedOutcome ? 1 : 0), `status ${status}: incorrect evidence count`);
  if (expectedOutcome) {
    assert(events[0].recordedStatus === status && events[0].outcome === expectedOutcome,
      `status ${status}: incorrect content-free evidence category`);
  }
}
// Verify the actual importer job-ID guard without calling the official site or DB.
// A returned 200 page for a different ID must never be saved under the requested URL.
const numberFnStart = importer.indexOf('function jobNumberFrom(');
const numberFnEnd = importer.indexOf('\nfunction locationParts(', numberFnStart);
const sourceIdStart = importer.indexOf('function sourceJobIdFromUrl(');
const sourceIdEnd = importer.indexOf('\n// A search page lists', sourceIdStart);
assert(numberFnStart >= 0 && numberFnEnd > numberFnStart && sourceIdStart >= 0 && sourceIdEnd > sourceIdStart,
  'job ID consistency helper functions must exist');
assert(importer.indexOf('const sourceJobId = jobNumberFrom(text, url)') < importer.indexOf('const lines = normalizedLines(text);'),
  'displayed job ID must be verified before normalization or upsert');
const matchSourceId = new Function('firstMatch', 'URL',
  `${importer.slice(numberFnStart, numberFnEnd).replace('text: string, url: URL', 'text, url')}
  ${importer.slice(sourceIdStart, sourceIdEnd).replace('url: string', 'url')}
  return jobNumberFrom;`)(
  (text, pattern) => text.match(pattern)?.[1] ?? null, URL,
);
for (const [displayed, urlId, expected] of [
  ['求人番号 12345-12345678', '1234512345678', '12345-12345678'],
  ['求人番号 12345-12345679', '1234512345678', 'HELLOWORK_JOB_NUMBER_MISMATCH'],
  ['求人番号 未記載', '1234512345678', 'HELLOWORK_JOB_NUMBER_UNVERIFIED'],
  ['求人番号 12345-12345678', 'invalid', 'HELLOWORK_JOB_NUMBER_UNVERIFIED'],
  ['求人番号 12345-12345678', '12345-12345678', '12345-12345678'],
]) {
  const sourceUrl = new URL('https://www.hellowork.mhlw.go.jp/kensaku/GECA110010.do');
  sourceUrl.searchParams.set('action', 'dispDetailBtn');
  sourceUrl.searchParams.set('kJNo', urlId);
  let actual;
  try { actual = matchSourceId(displayed, sourceUrl); }
  catch (error) { actual = error.message; }
  assert(actual === expected, `job ID fixture expected ${expected}, got ${actual}`);
}

console.log('hellowork-structured-data-contract: PASS');
