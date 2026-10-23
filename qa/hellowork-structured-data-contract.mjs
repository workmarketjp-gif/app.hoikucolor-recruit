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

console.log('hellowork-structured-data-contract: PASS');
