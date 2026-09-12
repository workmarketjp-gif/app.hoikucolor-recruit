import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const repository = read('src/lib/recruitRepository.ts');
const visitRepository = read('src/lib/visitRepository.ts');
const visitUi = read('src/components/VisitTrialPanel.tsx');
const transparencyRepository = read('src/lib/jobTransparencyRepository.ts');
const transparencyUi = read('src/components/InterviewTransparencyPanel.tsx');
const applicationDetail = read('src/components/ApplicationDetail.tsx');
const attention = read('src/components/AttentionSummaryEnhancer.tsx');
const notifications = read('src/components/NotificationCenter.tsx');
const externalReturn = read('src/components/ExternalJobReturnEnhancer.tsx');
const matchRoute = read('src/MatchRouteRoot.tsx');
const compareRoute = read('src/CompareRouteRoot.tsx');
const scoutRoute = read('src/ScoutRouteRoot.tsx');

const requiredRepositoryMarkers = [
  ".from('hc_jobseeker_job_feed')",
  ".from('hc_public_workplace_profiles')",
  ".from('hc_public_finance_profiles')",
  ".from('hc_saved_jobs')",
  "rpc('hc_jobseeker_submit_application'",
  "rpc('hc_jobseeker_list_applications'",
  "rpc('hc_jobseeker_get_application_detail'",
  "rpc('hc_jobseeker_respond_interview'",
];
for (const marker of requiredRepositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Core journey repository contract missing: ${marker}`);
}

if (!app.includes('<VisitTrialPanel jobId={job.id} facilityId={job.facility_id} />')) {
  throw new Error('Core journey app wiring missing: VisitTrialPanel');
}
for (const marker of ['<ExternalJobReturnEnhancer />', '<AttentionSummaryEnhancer />']) {
  if (!main.includes(marker)) throw new Error(`Core journey root wiring missing: ${marker}`);
}

const visitMarkers = [
  "rpc('hc_jobseeker_get_visit_settings'",
  "rpc('hc_list_my_visit_reservations'",
  "rpc('hc_request_visit'",
  "rpc('hc_cancel_visit'",
];
for (const marker of visitMarkers) {
  if (!visitRepository.includes(marker)) throw new Error(`Visit journey contract missing: ${marker}`);
}
for (const forbidden of [".from('hc_visit_settings')", ".from('hc_visit_reservations')", 'facility_note']) {
  if (visitRepository.includes(forbidden)) throw new Error(`Visit journey bypasses candidate-safe RPC boundary: ${forbidden}`);
}
if (!visitUi.includes('getVisitSettings(jobId)') || !visitUi.includes("settingRow.facility_id !== facilityId")) {
  throw new Error('Visit settings are not bound to the published job/facility pair.');
}

if (!transparencyRepository.includes("rpc('hc_jobseeker_get_job_transparency'")) {
  throw new Error('Interview-transparency journey is not using the candidate-safe RPC.');
}
for (const marker of ['園の公開回答', 'HO Verified']) {
  if (!transparencyUi.includes(marker)) throw new Error(`Transparency source separation missing: ${marker}`);
}

for (const marker of [
  'id={`interview-${interview.id}`}',
  'id="application-messages"',
  "respondToInterview(interview.id",
  'この日時でOK',
  '日程変更を希望',
  '<ApplicationMessages applicationId={application.id} />',
]) {
  if (!applicationDetail.includes(marker)) throw new Error(`Application-selection journey missing: ${marker}`);
}

for (const marker of [
  'unanswered_interviews_count',
  'unread_messages_count',
  'pending_scouts_count',
  '#application-messages',
  '#scout-inbox',
  'IntersectionObserver',
]) {
  if (!attention.includes(marker)) throw new Error(`Attention-summary journey missing: ${marker}`);
}

for (const marker of ['application_id', 'interview_id', '/applications', '/scouts']) {
  if (!notifications.includes(marker)) throw new Error(`Notification deep-link journey missing: ${marker}`);
}

for (const marker of [
  "url.origin !== window.location.origin",
  "url.pathname.replace(/\\/$/, '') !== '/jobs'",
  "sessionStorage.setItem(returnStorageKey",
  "jobs.findIndex((job) => job.id === jobId)",
  "detailButton?.click()",
]) {
  if (!externalReturn.includes(marker)) throw new Error(`External-job return journey missing: ${marker}`);
}

for (const marker of ['compareMatchedJobs', 'matchJob', 'condition_score', '保育観']) {
  if (!matchRoute.includes(marker)) throw new Error(`Matching journey missing: ${marker}`);
}
for (const marker of ['HO Verified', 'HF Verified', '園掲載']) {
  if (!compareRoute.includes(marker)) throw new Error(`Facility comparison source separation missing: ${marker}`);
}
for (const marker of ['ScoutInbox', '/scouts', 'NotificationCenter']) {
  if (!scoutRoute.includes(marker)) throw new Error(`Scout journey missing: ${marker}`);
}

console.log('Hoiku Color core jobseeker journey contract passed.');
