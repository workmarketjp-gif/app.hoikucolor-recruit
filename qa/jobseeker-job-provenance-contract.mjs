import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const app = read('src/App.tsx');
const compare = read('src/CompareRouteRoot.tsx');
const savedStatusRepo = read('src/lib/savedJobStatusRepository.ts');
const savedCrudMigration = read('supabase/migrations/20260919010206_hc_jobseeker_saved_job_rpc_boundary_v1.sql');
const savedClosedMigration = read('supabase/migrations/20260919134116_hc_jobseeker_saved_closed_status_v1.sql');

const checks = [
  ['saved history uses deadline-aware RPC', savedStatusRepo.includes("rpc('hc_jobseeker_list_saved_jobs_with_status')")],
  ['saved closed-status migration preserves JWT ownership', savedClosedMigration.includes("nullif((select auth.jwt()) ->> 'sub', '')") && savedClosedMigration.includes('where s.clerk_user_id = v_actor')],
  ['closed saved jobs remain visible as history', app.includes('募集終了後も保存履歴として確認できます。') && app.includes("'募集終了' : applying ? '応募中…' : '応募する'")],
  ['closed saved jobs cannot apply', app.includes('disabled={applying || isClosed}')],
  ['closed saved jobs do not expose visit/trial action', app.includes('expanded && !isClosed && <VisitTrialPanel')],
  ['job cards mark facility-entered values', app.includes('<span>園掲載</span>')],
  ['job cards explicitly mark missing HO actuals', app.includes('HO実績データなし')],
  ['job cards explicitly mark missing HF actuals', app.includes('HF実績データなし')],
  ['job cards retain positive HO actual label', app.includes('✓ Hoiku Office 実績')],
  ['job cards retain positive HF actual label', app.includes('✓ Hoiku Finance 実績')],
  ['compare legend separates facility values', compare.includes('求人票・園が公開した情報です。実績値とは別に表示します。')],
  ['compare legend separates HO actuals', compare.includes('Hoiku Officeの確定実績から自動集計された値です。')],
  ['compare legend separates HF actuals', compare.includes('Hoiku Financeの確定済み会計実績から自動集計された値です。')],
  ['compare never backfills missing verified data with facility values', compare.includes('未取得は「実績未公開」とし、園の掲載値で補完しません。')],
  ['saved CRUD migration derives actor only from JWT', savedCrudMigration.includes("v_actor text := nullif((select auth.jwt()) ->> 'sub', '')")],
  ['new save requires current Candidate-visible feed', savedCrudMigration.includes('from public.hc_jobseeker_job_feed f') && savedCrudMigration.includes("raise exception 'HC_JOB_NOT_AVAILABLE'")],
  ['saved CRUD migration grants only authenticated execution', savedCrudMigration.includes('grant execute on function public.hc_jobseeker_save_job(uuid)') && savedCrudMigration.includes('to authenticated;')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} HC-W02 provenance contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} HC-W02 provenance contract checks passed.`);
