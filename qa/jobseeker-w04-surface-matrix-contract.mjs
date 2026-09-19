import fs from 'node:fs';

const main = fs.readFileSync('src/main.tsx', 'utf8');
const scoutInbox = fs.readFileSync('src/components/ScoutInbox.tsx', 'utf8');
const scoutRepo = fs.readFileSync('src/lib/scoutInboxRepository.ts', 'utf8');
const visitRoute = fs.readFileSync('src/VisitRouteRoot.tsx', 'utf8');
const visitRepo = fs.readFileSync('src/lib/visitRepository.ts', 'utf8');
const spotRoute = fs.readFileSync('src/SpotJobsRouteRoot.tsx', 'utf8');
const spotRepo = fs.readFileSync('src/lib/spotJobRepository.ts', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [
  ['scout route is registered', main.includes("window.location.pathname.startsWith('/scouts')") && main.includes('<ScoutRouteRoot />')],
  ['visit/trial route is registered', main.includes("window.location.pathname.startsWith('/visits')") && main.includes('<VisitRouteRoot />')],
  ['SPOT route is registered', main.includes("window.location.pathname.startsWith('/spot-jobs')") && main.includes('<SpotJobsRouteRoot />')],

  ['scout uses candidate-safe list/respond RPCs', scoutRepo.includes("rpc('hc_jobseeker_list_scouts')") && scoutRepo.includes("rpc('hc_jobseeker_respond_scout'")],
  ['scout client does not query invitation table directly', !scoutRepo.includes("from('hc_scout_invitations')")],
  ['scout keeps identity private until acceptance', scoutInbox.includes('承諾するまで氏名・メール・電話番号は開示されません') && scoutInbox.includes('辞退した場合、氏名・連絡先は園へ共有されません')],

  ['visit/trial reads and writes through shared RPCs', visitRepo.includes("rpc('hc_jobseeker_get_visit_settings'") && visitRepo.includes("rpc('hc_jobseeker_list_my_visits')") && visitRepo.includes("rpc('hc_request_visit'") && visitRepo.includes("rpc('hc_cancel_visit'")],
  ['visit history returns to the shared application ledger when linked', visitRoute.includes('/applications?application_id=${encodeURIComponent(item.application_id)}') && visitRoute.includes('応募状況を見る')],
  ['visit deep-link only focuses an owned returned reservation', visitRoute.includes('visits.find((item) => item.reservation_id === visitId)') && visitRoute.includes('指定された見学・体験は見つかりませんでした')],

  ['SPOT applies through the standard candidate application function', spotRoute.includes("import { getProfile, submitApplication } from './lib/recruitRepository'") && spotRoute.includes('submitApplication(job.job_id, profile)')],
  ['SPOT reads only candidate-safe RPC surfaces', spotRepo.includes("rpc('hc_jobseeker_list_spot_jobs')") && spotRepo.includes("rpc('hc_jobseeker_list_my_spot_assignments')") && !spotRepo.includes("from('hc_spot_assignments')")],
  ['SPOT confirmed work returns to the same application ledger', spotRoute.includes('/applications?application_id=${encodeURIComponent(assignment.application_id)}') && spotRoute.includes('応募内容を見る')],

  ['existing scout/visit/SPOT contracts remain in the full build gate', pkg.scripts.build.includes('npm run test:jobseeker-scout-inbox') && pkg.scripts.build.includes('npm run test:visit-trial') && pkg.scripts.build.includes('npm run test:jobseeker-spot-jobs') && pkg.scripts.build.includes('npm run test:jobseeker-spot-lifecycle')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (failed.length) {
  console.error(`\n${failed.length} HC-W04 surface-matrix contract check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length} HC-W04 surface-matrix contract checks passed.`);
