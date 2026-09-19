import fs from 'node:fs';

const main = fs.readFileSync('src/main.tsx', 'utf8');
const connectivity = fs.readFileSync('src/components/WebConnectivityBanner.tsx', 'utf8');
const connectivityCss = fs.readFileSync('src/components/WebConnectivityBanner.css', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const mobile = fs.readFileSync('src/mobile-hardening.css', 'utf8');
const repository = fs.readFileSync('src/lib/recruitRepository.ts', 'utf8');
const idempotency = fs.readFileSync('supabase/migrations/20260910205000_hc_jobseeker_application_idempotency_and_availability.sql', 'utf8').toLowerCase();

const checks = [
  ['connectivity recovery is mounted globally', main.includes("import { WebConnectivityBanner }") && main.includes('<WebConnectivityBanner />')],
  ['offline/online state is observed', connectivity.includes("addEventListener('offline'") && connectivity.includes("addEventListener('online'") && connectivity.includes('navigator.onLine')],
  ['offline recovery offers explicit reload', connectivity.includes('再読み込み') && connectivity.includes('window.location.reload()')],
  ['offline recovery is accessible', connectivity.includes('role="status"') && connectivity.includes('aria-live="polite"')],
  ['offline recovery stays usable on narrow mobile', connectivityCss.includes('@media(max-width:460px)') && connectivityCss.includes('min-height:44px')],
  ['web mobile hardening remains mounted', main.includes("import './mobile-hardening.css'") && mobile.includes('@media(max-width:760px)') && mobile.includes('@media(max-width:390px)')],
  ['mobile overflow and touch targets remain hardened', mobile.includes('overflow-x:clip') && mobile.includes('min-height:44px')],
  ['application submit blocks incomplete name', app.includes("if (!profile?.name?.trim()) throw new Error('応募前にプロフィールのお名前を保存してください。')") && repository.includes("if (!applicantName) throw new Error('応募前にプロフィールのお名前を登録してください。')")],
  ['application submit prevents repeated clicks while pending', app.includes('disabled={applying || isClosed}') && app.includes("applying ? '応募中…'")],
  ['application creation is database-idempotent', idempotency.includes('hc_applications_jobseeker_job_unique') && idempotency.includes('where a.job_id = p_job_id') && idempotency.includes('exception when unique_violation')],
  ['application submit verifies an application id', repository.includes("if (typeof data !== 'string' || !data) throw new Error('応募IDを取得できませんでした。')")],
  ['document handoff failure cannot erase successful application', repository.includes('The application row already exists at this point') && repository.includes('setApplicationDocumentHandoffWarning(applicationId, true)')],
  ['application state refreshes after focus/visibility changes', app.includes("window.addEventListener('focus', refreshWhenVisible)") && app.includes("document.addEventListener('visibilitychange', refreshWhenVisible)")],
  ['saved-job optimistic mutation rolls back on failure', app.includes("setError(err instanceof Error ? err.message : '保存状態を更新できませんでした。')") && app.includes('setSavedJobs(await listSavedJobsWithStatus().catch(() => savedJobs))')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} HC-W06 web resilience contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} HC-W06 web resilience contract checks passed.`);
