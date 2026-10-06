import fs from 'node:fs';

const baseMigration = fs.readFileSync('supabase/migrations/20261006213000_hc_external_job_sources_v1.sql', 'utf8');
const publicFeedMigration = fs.readFileSync('supabase/migrations/20261006224500_hc_hellowork_nationwide_sync_v1.sql', 'utf8');
const sourceUrlFix = fs.readFileSync('supabase/migrations/20261006225500_hc_external_job_source_url_check_fix.sql', 'utf8');
const roleCycleMigration = fs.readFileSync('supabase/migrations/20261006231000_hc_hellowork_core_role_cycle_v1.sql', 'utf8');
const syncLeaseMigration = fs.readFileSync('supabase/migrations/20261006235500_hc_hellowork_sync_lease_v1.sql', 'utf8');
const repository = fs.readFileSync('src/lib/recruitRepository.ts', 'utf8');
const card = fs.readFileSync('src/components/JobCard.tsx', 'utf8');
const css = fs.readFileSync('src/candidate-shell.css', 'utf8');
const importer = fs.readFileSync('supabase/functions/hc-hellowork-import/index.ts', 'utf8');

const publicView = baseMigration.match(
  /create or replace view public\.hc_external_job_public_feed[\s\S]*?revoke all on public\.hc_external_job_public_feed/
)?.[0] || '';

const checks = [
  ['external source has its own table', baseMigration.includes('create table if not exists public.hc_external_job_sources')],
  ['raw external table has RLS', baseMigration.includes('alter table public.hc_external_job_sources enable row level security')],
  ['browser roles cannot read raw source table', baseMigration.includes('revoke all on public.hc_external_job_sources from public, anon, authenticated')],
  ['public view never exposes raw source_payload', Boolean(publicView) && !publicView.includes('source_payload')],
  ['public view requires explicit republication permission', publicFeedMigration.includes('e.public_republication_allowed = true')],
  ['public view expires stale source verification within 12 hours', publicFeedMigration.includes("e.last_verified_at >= now() - interval '12 hours'")],
  ['public view excludes managed canonical duplicates', publicFeedMigration.includes('e.claimed_job_id is null')],
  ['Hello Work URL is constrained to official host', sourceUrlFix.includes("source_url ~ '^https://www\\.hellowork\\.mhlw\\.go\\.jp/kensaku/'")],
  ['candidate search v2 unions external feed', baseMigration.includes('hc_jobseeker_search_jobs_v2') && baseMigration.includes('from public.hc_external_job_public_feed e')],
  ['external jobs cannot direct apply', baseMigration.includes('false as can_apply_direct')],
  ['candidate client uses combined search', repository.includes("rpc('hc_jobseeker_search_jobs_v2'")],
  ['candidate exact lookup can resolve external job', repository.includes("rpc('hc_jobseeker_get_job_v2'")],
  ['facets include external jobs', repository.includes("rpc('hc_jobseeker_job_search_facets_v2'")],
  ['Job type carries source metadata', repository.includes('source_name?: string | null') && repository.includes('is_external?: boolean')],
  ['external card hides saved control', card.includes('!isExternal && <button') && card.includes('気になるに保存')],
  ['external card does not render visit/trial', card.includes('!isExternal && !isClosed && <VisitTrialPanel')],
  ['external card links to source instead of HC application', card.includes('hc-external-job-link') && card.includes('canApplyDirect')],
  ['source attribution is in the detail footer', card.includes('hc-job-source-footer') && card.includes('出典：')],
  ['source footer is visually secondary', css.includes('.hc-job-source-footer') && css.includes('font-size: 14px')],
  ['importer accepts only official Hello Work detail URLs', importer.includes("url.hostname !== 'www.hellowork.mhlw.go.jp'") && importer.includes("action') !== 'dispDetailBtn'")],
  ['sync endpoint accepts service-role or private rotating DB secret', importer.includes("payload?.role === 'service_role'") && importer.includes("request.headers.get('x-hc-sync-secret')") && importer.includes('equalSecret')],
  ['sync secret table is browser-private', publicFeedMigration.includes('revoke all on public.hc_external_source_sync_control from public, anon, authenticated')],
  ['registered-jobseeker-only pages are blocked', importer.includes('ハローワークに求職登録した方のみを対象') && importer.includes('事業所の意向により公開していません')],
  ['employer opt-out wording is blocked', importer.includes('無断転載') && importer.includes('転載禁止') && importer.includes('掲載はお断り')],
  ['importer is childcare-position scoped', importer.includes('ALLOWED_POSITION') && importer.includes('保育士') && importer.includes('幼稚園教諭')],
  ['importer defaults unsafe pages to non-public', importer.includes("status: Normalized['source_status']") && importer.includes('public_republication_allowed: allowed')],
  ['online self-apply status is captured', importer.includes('オンライン自主応募の受付') && importer.includes('online_self_apply_allowed')],
  ['nationwide discovery cycles proven core childcare terms', importer.includes("const SEARCH_TERMS = ['保育士', '保育教諭', '幼稚園教諭', '保育補助']") && roleCycleMigration.includes('query_cursor')],
  ['discovery is prefecture paginated and bounded', importer.includes('prefecture_cursor') && importer.includes('DISCOVERY_PAGE_SIZE = 50') && importer.includes('DISCOVERY_CONCURRENCY = 5')],
  ['crawler has an expiring sync lease', syncLeaseMigration.includes('sync_lease_token') && syncLeaseMigration.includes('sync_lease_until') && importer.includes('acquireDiscoveryLease') && importer.includes('SYNC_BUSY_OR_DISABLED')],
  ['crawler state update is lease-owner scoped', importer.includes(".eq('sync_lease_token', leaseToken)") && importer.includes('DISCOVERY_STATE_UPDATE_FAILED')],
  ['refresh mode re-verifies existing rows', importer.includes('async function refreshUrls()') && importer.includes('body.refresh')],
  ['current parser uses exact section labels', importer.includes("const PARSER_VERSION = 'hellowork-public-v4'") && importer.includes('normalizedLines') && importer.includes('exactIndex')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} external-job contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} external-job contract checks passed.`);
