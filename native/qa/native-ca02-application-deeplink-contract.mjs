import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.resolve(root, relative), 'utf8');
const checks = [];
function expect(name, condition) {
  checks.push([name, Boolean(condition)]);
  if (!condition) throw new Error(`CA02_CONTRACT_FAILED: ${name}`);
}

const api = read('src/lib/applicationJourneyApi.ts');
const jobs = read('src/app/(tabs)/jobs.tsx');
const tabs = read('src/app/(tabs)/_layout.tsx');
const applications = read('src/app/(tabs)/applications.tsx');
const detail = read('src/app/application/[id].tsx');
const jobDetail = read('src/app/job/[id].tsx');
const visits = read('src/app/visits.tsx');
const notifications = read('src/lib/notifications.ts');
const canonicalApplication = read('../supabase/migrations/20260910205000_hc_jobseeker_application_idempotency_and_availability.sql');
const nativeIdempotency = read('../supabase/migrations/20260919063000_hc_native_mobile_idempotency_v5.sql');

expect('candidate application list uses canonical RPC', api.includes("rpc('hc_jobseeker_list_applications'"));
expect('candidate application detail uses canonical RPC', api.includes("rpc('hc_jobseeker_get_application_detail'"));
expect('message read uses candidate-safe canonical RPC', api.includes("rpc('hc_jobseeker_list_application_messages'"));
expect('application submit uses canonical RPC', api.includes("rpc('hc_jobseeker_submit_application'"));
expect('application submit verifies canonical detail before success', api.includes('detail.application.job_id !== jobId'));
expect('canonical submit is server-idempotent per job/candidate', canonicalApplication.includes('hc_applications_jobseeker_job_unique') && canonicalApplication.includes('return v_application_id'));
expect('message mutation uses Native idempotent wrapper', api.includes("rpc('hc_send_message_v2'"));
expect('message wrapper delegates business rule to canonical send', nativeIdempotency.includes('v_message := public.hc_send_message(p_application_id, v_body)'));
expect('message durable key clears only after canonical read confirmation', api.includes('const messages = await listApplicationMessages') && api.indexOf('const messages = await listApplicationMessages') < api.indexOf("clearDurableMutation({ userId: params.ownerId, kind: 'message'"));
expect('offer acceptance uses canonical candidate RPC', api.includes("rpc('hc_jobseeker_accept_offer'"));
expect('withdrawal uses canonical candidate RPC', api.includes("rpc('hc_jobseeker_withdraw_application'"));
expect('terminal offer/withdraw UI uses canonical journey helpers', detail.includes('acceptOffer(pinned.client, applicationId') && detail.includes('withdrawApplication(pinned.client, applicationId'));
expect('interview response reuses canonical candidate RPC', api.includes("rpc('hc_jobseeker_respond_interview'"));
expect('interview response is durably payload-pinned before canonical retry', api.includes("kind: 'interview'") && api.includes('candidate_response_status !== params.responseStatus'));
expect('visit mutation uses Native idempotent wrapper', api.includes("rpc('hc_request_visit_v2'"));
expect('visit wrapper delegates business rule to canonical request', nativeIdempotency.includes('v_id := public.hc_request_visit('));
expect('visit result is verified before durable key clears', api.includes('if (!visits.some((visit) => visit.reservation_id === data))'));
expect('visit cancellation reuses canonical RPC and verifies cancelled state', api.includes("rpc('hc_cancel_visit'") && api.includes("visit.status !== 'cancelled'"));
expect('document handoff reuses existing vault APIs and is repairable', api.includes('attachJobseekerDocumentToApplication') && api.includes('repairApplicationDocumentHandoff'));
expect('jobs open a concrete Native job/apply route', jobs.includes('router.push(`/job/${job.id}`'));
expect('job route submits using canonical journey API', jobDetail.includes('submitApplication(pinned.client, jobId, profile)'));
expect('applications tab exists and opens concrete detail route', tabs.includes('name="applications"') && applications.includes('router.push(`/application/${application.id}`'));
expect('application detail renders candidate messages', detail.includes('sendApplicationMessageDurable') && detail.includes("focus === 'messages'"));
expect('application detail handles exact interview deep link', detail.includes("focus === 'interview'") && detail.includes('focusedInterviewId === interview.id'));
expect('application detail links visit journey', detail.includes('router.push(`/visits?'));
expect('visits route uses durable request and canonical cancel', visits.includes('requestVisitDurable') && visits.includes('cancelVisit'));
expect('visits route highlights exact pushed reservation', visits.includes('visit.reservation_id === focusedVisitId'));
expect('Push route mapper lands on materialized application route', notifications.includes('`/application/${applicationId}?${query.toString()}`') && notifications.includes('`/application/${applicationId}`'));
expect('Push route mapper lands on materialized visits route', notifications.includes("return '/visits';") && notifications.includes('`/visits?${query.toString()}`'));
expect('Native journey does not introduce facility/admin mutation RPCs', !/hc_(?:admin|facility)_[a-z0-9_]+\s*['")]/i.test(api));
expect('Native journey never directly updates application status table', !/from\(['"]hc_applications['"]\)\s*\.update/i.test(api));

console.log(`CA-02 Native application/deep-link contract: ${checks.length}/${checks.length} PASS`);
