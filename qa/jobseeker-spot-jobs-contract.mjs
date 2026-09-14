import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const migration = read('supabase/migrations/20260913050000_hc_jobseeker_spot_jobs_v1.sql');
const repository = read('src/lib/spotJobRepository.ts');
const route = read('src/SpotJobsRouteRoot.tsx');
const css = read('src/SpotJobsRouteRoot.css');
const navigation = read('src/components/SpotNavigationEnhancer.tsx');
const main = read('src/main.tsx');

const checks = [
  [/function public\.hc_jobseeker_list_spot_jobs\(\)/i.test(migration), 'candidate-safe spot list RPC must exist'],
  [/v_user_id text := auth\.jwt\(\) ->> 'sub'/i.test(migration), 'spot RPC must bind candidate identity to Clerk JWT subject'],
  [/j\.source_type = 'spot_job'/i.test(migration) && /j\.status = 'published'/i.test(migration) && /s\.status = 'published'/i.test(migration), 'candidate spot rows must require both HC and HO publication'],
  [/\(s\.work_date \+ s\.start_time\) > \(now\(\) at time zone 'Asia\/Tokyo'\)/i.test(migration), 'past spot shifts must not be returned'],
  [/capacity\.confirmed_count < greatest\(coalesce\(s\.required_count, 1\), 1\)/i.test(migration), 'filled spot shifts must not be returned'],
  [/a\.jobseeker_clerk_user_id = v_user_id/i.test(migration), 'candidate application state must be owner-scoped'],
  [/revoke all on function public\.hc_jobseeker_list_spot_jobs\(\) from public, anon/i.test(migration), 'anonymous callers must not execute the spot list RPC'],
  [/grant execute on function public\.hc_jobseeker_list_spot_jobs\(\) to authenticated, service_role/i.test(migration), 'authenticated candidates must execute the spot list RPC'],
  [/if v_source_type = 'spot_job'/i.test(migration) && /v_spot\.status <> 'published'/i.test(migration), 'application creation must re-check canonical HO spot publication'],
  [/spot job capacity is filled/i.test(migration), 'application creation must reject filled spot shifts'],
  [/select a\.id into v_application_id[\s\S]*jobseeker_clerk_user_id = v_user_id[\s\S]*if v_application_id is not null then[\s\S]*return v_application_id/i.test(migration), 'repeat application submission must be idempotent'],
  [/revoke all on function ho_private\.hc_jobseeker_submit_application_impl[\s\S]*authenticated/i.test(migration), 'candidate browser must not execute the private application implementation'],
  [repository.includes("rpc('hc_jobseeker_list_spot_jobs')"), 'client must use the candidate-safe spot RPC'],
  [!repository.includes("from('ho_spot_job_drafts')") && !repository.includes("from('hc_spot_assignments')"), 'candidate client must not query canonical spot tables directly'],
  [route.includes('スポット勤務') && route.includes('通常求人とは分けて表示しています'), 'spot work must be unmistakably separated from ordinary jobs'],
  [route.includes('work_date') && route.includes('start_time') && route.includes('end_time') && route.includes('break_minutes') && route.includes('hourly_rate'), 'spot card must show date, times, break and hourly rate'],
  [route.includes('available_count') && route.includes('required_count'), 'spot card must expose capacity clearly'],
  [route.includes('getProfile') && route.includes('submitApplication'), 'spot card must connect to the standard candidate application flow'],
  [route.includes('application_id') && route.includes('/applications?application_id='), 'applied spot jobs must deep-link to application status'],
  [main.includes("import('./SpotJobsRouteRoot')") && main.includes("startsWith('/spot-jobs')"), 'spot jobs must be a lazy authenticated route'],
  [navigation.includes('href="/spot-jobs"') && navigation.includes('スポット求人'), 'main jobseeker navigation must expose spot jobs'],
  [css.includes('@media(max-width:390px)') && css.includes('min-height:44px'), 'spot experience must retain 390px and tap-target hardening'],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('Jobseeker spot jobs contract failed:\n- ' + failed.join('\n- '));
  process.exit(1);
}
console.log(`Jobseeker spot jobs contract passed (${checks.length} checks).`);
