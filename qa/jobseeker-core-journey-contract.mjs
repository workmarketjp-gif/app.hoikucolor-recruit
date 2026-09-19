import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const repository = read('src/lib/recruitRepository.ts');
const rankedCatalog = read('supabase/migrations/20260913090000_hc_jobseeker_ranked_catalog_v1.sql');
const visitRepository = read('src/lib/visitRepository.ts');
const visitUi = read('src/components/VisitTrialPanel.tsx');
const transparencyRepository = read('src/lib/jobTransparencyRepository.ts');
const transparencyUi = read('src/components/InterviewTransparencyPanel.tsx');
const applicationDetail = read('src/components/ApplicationDetail.tsx');
const applicationMessages = read('src/components/ApplicationMessages.tsx');
const expectationRepository = read('src/lib/applicationDocumentExpectationRepository.ts');
const expectationSnapshot = read('supabase/migrations/20260913220000_hc_jobseeker_application_document_expectation_snapshot_v1.sql');
const attention = read('src/components/AttentionSummaryEnhancer.tsx');
const notifications = read('src/components/NotificationCenter.tsx');
const externalReturn = read('src/components/ExternalJobReturnEnhancer.tsx');
const matchRoute = read('src/MatchRouteRoot.tsx');
const compareRoute = read('src/CompareRouteRoot.tsx');
const scoutRoute = read('src/ScoutRouteRoot.tsx');

const requiredRepositoryMarkers = [
  "rpc('hc_jobseeker_list_ranked_jobs')",
  "rpc('hc_jobseeker_list_saved_job_ids')",
  "rpc('hc_jobseeker_save_job'",
  "rpc('hc_jobseeker_unsave_job'",
  "rpc('hc_jobseeker_get_profile')",
  "rpc('hc_jobseeker_upsert_profile'",
  "rpc('hc_jobseeker_submit_application'",
  "rpc('hc_jobseeker_list_applications'",
  "rpc('hc_jobseeker_get_application_detail'",
  "rpc('hc_jobseeker_respond_interview'",
];
for (const marker of requiredRepositoryMarkers) {
  if (!repository.includes(marker)) throw new Error(`Core journey repository contract missing: ${marker}`);
}
for (const forbidden of [".from('hc_saved_jobs')", ".from('hc_jobseeker_profiles')"]) {
  if (repository.includes(forbidden)) throw new Error(`Core journey bypasses the actor-scoped RPC: ${forbidden}`);
}
for (const marker of ['from public.hc_jobseeker_job_feed r', 'hc_public_workplace_profiles', 'hc_public_finance_profiles']) {
  if (!rankedCatalog.includes(marker)) throw new Error(`Core journey ranked catalog contract missing: ${marker}`);
}
if (rankedCatalog.includes('hc_verified_workplace_snapshots') || rankedCatalog.includes('hc_verified_finance_snapshots')) {
  throw new Error('Core journey ranked catalog must not read raw Verified snapshots.');
}

for (const marker of [
  'listJobseekerDocuments',
  'document.is_default',
  'attachJobseekerDocumentToApplication(document, applicationId)',
  'Promise.allSettled',
]) {
  if (!repository.includes(marker)) throw new Error(`Default Document Vault handoff missing: ${marker}`);
}
if (!repository.includes('await handoffDefaultDocuments(data);')) {
  throw new Error('Successful application submission must trigger default Document Vault handoff.');
}

for (const marker of [
  "from('hc_application_document_expectations')",
  'source_jobseeker_document_id_snapshot',
  'destination_file_path',
]) {
  if (!expectationRepository.includes(marker)) throw new Error(`Application-time Document Vault expectation repository missing: ${marker}`);
}
for (const marker of [
  'create table if not exists public.hc_application_document_expectations',
  'v_application_created boolean := false',
  'if v_application_created then',
  'd.is_default',
  'source_jobseeker_document_id_snapshot',
  'destination_file_path',
  "jobseeker_clerk_user_id = ((select auth.jwt()) ->> 'sub')",
  'grant select on table public.hc_application_document_expectations to authenticated',
]) {
  if (!expectationSnapshot.includes(marker)) throw new Error(`Application-time Document Vault snapshot migration missing: ${marker}`);
}
for (const forbidden of [
  'grant insert on table public.hc_application_document_expectations to authenticated',
  'grant update on table public.hc_application_document_expectations to authenticated',
  'grant delete on table public.hc_application_document_expectations to authenticated',
]) {
  if (expectationSnapshot.includes(forbidden)) throw new Error(`Candidates must not mutate application-time document expectations: ${forbidden}`);
}
for (const marker of [
  'listJobseekerDocuments()',
  'listSubmittedApplicationDocuments(applicationId)',
  'listApplicationDocumentExpectations(applicationId)',
  'submittedPaths.has(expectation.destination_file_path)',
  'source_jobseeker_document_id_snapshot',
  'setMissingExpectedDocuments(missingExpectations)',
  'attachMissingExpectedDocuments',
  'repairableMissingDocuments.map((document) => attachJobseekerDocumentToApplication(document, applicationId))',
  '応募した時点で「応募時に使用」',
  '未提出の応募時書類をまとめて提出',
]) {
  if (!applicationMessages.includes(marker)) throw new Error(`Application-time Document Vault recovery UX missing: ${marker}`);
}
for (const forbidden of [
  'hasApplicationDocumentHandoffWarning',
  'clearApplicationDocumentHandoffWarning',
  'sessionStorage',
  'document.is_default && !nextAttachedIds.includes(document.id)',
]) {
  if (applicationMessages.includes(forbidden)) throw new Error(`Application document recovery must not depend on mutable current-default/session state: ${forbidden}`);
}

if (!app.includes('<VisitTrialPanel jobId={job.id} facilityId={job.facility_id} />')) {
  throw new Error('Core journey app wiring missing: VisitTrialPanel');
}
for (const marker of ['<ExternalJobReturnEnhancer />', '<AttentionSummaryEnhancer />']) {
  if (!main.includes(marker)) throw new Error(`Core journey root wiring missing: ${marker}`);
}

const visitMarkers = [
  "rpc('hc_jobseeker_get_visit_settings'",
  "rpc('hc_list_my_visit_reservations_v2'",
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
  "window.addEventListener('hc:application-messages-viewed'",
]) {
  if (!attention.includes(marker)) throw new Error(`Attention-summary journey missing: ${marker}`);
}
for (const marker of [
  "window.location.hash !== '#application-messages'",
  "load({ acknowledge: true })",
  "new CustomEvent('hc:application-messages-viewed'",
]) {
  if (!applicationMessages.includes(marker)) throw new Error(`Message-read journey missing: ${marker}`);
}
if (attention.includes('IntersectionObserver')) {
  throw new Error('Closed communication-card visibility must not acknowledge unread facility messages.');
}

for (const marker of ['application_id', 'interview_id', '/applications', '/scouts']) {
  if (!notifications.includes(marker)) throw new Error(`Notification deep-link journey missing: ${marker}`);
}

for (const marker of [
  'url.origin !== window.location.origin',
  "url.pathname.replace(/\\/$/, '') !== '/jobs'",
  'sessionStorage.setItem(returnStorageKey',
  'getRankedJob(jobId)',
  '`.job-card[data-job-id="${jobId}"]`',
  "detailButton?.click()",
]) {
  if (!externalReturn.includes(marker)) throw new Error(`External-job return journey missing: ${marker}`);
}
if (!app.includes('targetJobId ? getRankedJob(targetJobId) : Promise.resolve(null)') || !app.includes('data-job-id={job.id}')) {
  throw new Error('Paginated job list does not preserve exact Google-job return targeting.');
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
