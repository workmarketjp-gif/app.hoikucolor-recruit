import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261006213000_hc_external_job_sources_v1.sql', 'utf8');
const repository = fs.readFileSync('src/lib/recruitRepository.ts', 'utf8');
const card = fs.readFileSync('src/components/JobCard.tsx', 'utf8');
const css = fs.readFileSync('src/candidate-shell.css', 'utf8');
const importer = fs.readFileSync('supabase/functions/hc-hellowork-import/index.ts', 'utf8');

const checks = [
  ['external source has its own table', migration.includes('create table if not exists public.hc_external_job_sources')],
  ['raw external table has RLS', migration.includes('alter table public.hc_external_job_sources enable row level security')],
  ['browser roles cannot read raw source table', migration.includes('revoke all on public.hc_external_job_sources from public, anon, authenticated')],
  ['public view never exposes raw source_payload', migration.includes('create or replace view public.hc_external_job_public_feed') && !migration.match(/hc_external_job_public_feed[\\s\\S]*?source_payload/)],
  ['public view requires explicit republication permission', migration.includes('e.public_republication_allowed = true')],
  ['public view expires stale source verification', migration.includes("e.last_verified_at >= now() - interval '36 hours'")],
  ['public view excludes claimed duplicates', migration.includes('e.claimed_job_id is null')],
  ['Hello Work URL is constrained to official host', migration.includes("source_url ~ '^https://www\\\\.hellowork\\\\.mhlw\\\\.go\\\\.jp/kensaku/'")],
  ['candidate search v2 unions external feed', migration.includes('hc_jobseeker_search_jobs_v2') && migration.includes('from public.hc_external_job_public_feed e')],
  ['external jobs cannot direct apply', migration.includes('false as can_apply_direct')],
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
  ['importer requires service role', importer.includes("payload?.role === 'service_role'") && importer.includes('SERVICE_ROLE_REQUIRED')],
  ['registered-jobseeker-only pages are blocked', importer.includes('ハローワークに求職登録した方のみを対象') && importer.includes('事業所の意向により公開していません')],
  ['importer is childcare-position scoped', importer.includes('ALLOWED_POSITION') && importer.includes('保育士') && importer.includes('幼稚園教諭')],
  ['importer defaults unsafe pages to non-public', importer.includes("status: Normalized['source_status']") && importer.includes('public_republication_allowed: allowed')],
  ['refresh mode re-verifies existing rows', importer.includes('async function refreshUrls()') && importer.includes('body.refresh')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\\n${failed.length} external-job contract check(s) failed.`);
  process.exit(1);
}
console.log(`\\n${checks.length} external-job contract checks passed.`);
