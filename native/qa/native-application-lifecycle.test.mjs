// Behavioural suite: post-application lifecycle (offer, withdrawal, visits), attention summary,
// exact-target notification links and partial-read notification state. Real production modules,
// synthetic RPC client, in-memory device storage. Never contacts a facility.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const href = (name) => pathToFileURL(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))).href;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (['expo-secure-store', 'expo-crypto'].includes(specifier)) return nextResolve(href('device-storage.stub.mjs'), context);
  if (specifier === './documentVaultApi' && context.parentURL?.includes('/src/lib/')) return nextResolve(href('journey-documentVaultApi.stub.mjs'), context);
  if (/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const api = await import('../src/lib/applicationJourneyApi.ts');
const dm = await import('../src/lib/durableMutation.ts');
const att = await import('../src/lib/attentionApi.ts');
const snap = await import('../src/lib/notificationReadSnapshot.ts');
const { fsState } = await import('./fixtures/device-storage.stub.mjs');

const APP = '22222222-2222-4222-8222-222222222222';
const JOB = '11111111-1111-4111-8111-111111111111';
const INT = '33333333-3333-4333-8333-333333333333';
const RES = '44444444-4444-4444-8444-444444444444';
const detail = (application = {}) => ({ application: { id: APP, job_id: JOB, ...application }, interviews: [], visits: [] });
const client = (handlers) => { const calls = []; return { calls, rpc: async (n, a) => { calls.push([n, a]); const h = handlers[n]; if (!h) throw new Error(`unexpected rpc ${n}`); return typeof h === 'function' ? h(a) : h; } }; };
beforeEach(() => { fsState.secure.clear(); fsState.secureUnavailable = false; dm.unblockDurableMutationSession('A', 's1'); });

// ---- offer ----------------------------------------------------------------
test('offer acceptance validates ids and message length before any RPC', async () => {
  const c = client({});
  await assert.rejects(api.acceptOffer(c, 'nope'), /応募ID/);
  await assert.rejects(api.acceptOffer(c, APP, 'x'.repeat(1001)), /1000/);
  assert.equal(c.calls.length, 0);
});
test('offer acceptance succeeds only when the server answer AND canonical readback both say accepted', async () => {
  const ok = client({ hc_jobseeker_accept_offer: { data: { offer_response: 'accepted' }, error: null }, hc_jobseeker_get_application_detail: { data: detail({ candidate_offer_response: 'accepted' }), error: null } });
  assert.equal((await api.acceptOffer(ok, APP, '  よろしくお願いします ')).application.candidate_offer_response, 'accepted');
  assert.equal(ok.calls[0][1].p_message, 'よろしくお願いします');
  const wrongAnswer = client({ hc_jobseeker_accept_offer: { data: { offer_response: 'declined' }, error: null } });
  await assert.rejects(api.acceptOffer(wrongAnswer, APP), /内定承諾の結果/);
  const staleReadback = client({ hc_jobseeker_accept_offer: { data: { offer_response: 'accepted' }, error: null }, hc_jobseeker_get_application_detail: { data: detail({ candidate_offer_response: null }), error: null } });
  await assert.rejects(api.acceptOffer(staleReadback, APP), /反映を確認できません/);
});
test('offer RPC error propagates (no optimistic success)', async () => {
  await assert.rejects(api.acceptOffer(client({ hc_jobseeker_accept_offer: { data: null, error: new Error('forbidden') } }), APP), /forbidden/);
});

// ---- withdraw ---------------------------------------------------------------
test('withdrawal needs server confirmation and canonical readback of status withdrawn', async () => {
  const ok = client({ hc_jobseeker_withdraw_application: { data: { status: 'withdrawn' }, error: null }, hc_jobseeker_get_application_detail: { data: detail({ status: 'withdrawn' }), error: null } });
  assert.equal((await api.withdrawApplication(ok, APP, ' 都合により ')).application.status, 'withdrawn');
  assert.equal(ok.calls[0][1].p_reason, '都合により');
  await assert.rejects(api.withdrawApplication(client({ hc_jobseeker_withdraw_application: { data: { status: 'applied' }, error: null } }), APP), /応募辞退の結果/);
  const stale = client({ hc_jobseeker_withdraw_application: { data: { status: 'withdrawn' }, error: null }, hc_jobseeker_get_application_detail: { data: detail({ status: 'applied' }), error: null } });
  await assert.rejects(api.withdrawApplication(stale, APP), /反映を確認できません/);
  await assert.rejects(api.withdrawApplication(client({}), APP, 'x'.repeat(1001)), /1000/);
});

// ---- visits -----------------------------------------------------------------
const visitReq = (c, o = {}) => api.requestVisitDurable({ client: c, ownerId: 'A', ownerSessionId: 's1', jobId: JOB, applicationId: APP, experienceType: 'visit', localDate: '2026-12-01', localTime: '10:00', ...o });
const visitClient = (listed = [{ reservation_id: RES, status: 'requested' }], data = RES) => client({ hc_request_visit_v2: { data, error: null }, hc_jobseeker_list_my_visits: { data: listed, error: null } });
test('visit request validates date and time formats before touching storage', async () => {
  await assert.rejects(visitReq(visitClient(), { localDate: '12/01/2026' }), /YYYY-MM-DD/);
  await assert.rejects(visitReq(visitClient(), { localTime: '10am' }), /HH:MM/);
  await assert.rejects(visitReq(visitClient(), { jobId: 'bad' }), /求人ID/);
  assert.equal(fsState.secure.size, 0);
});
test('visit request sends the durable request id and clears it only after the reservation is read back', async () => {
  const c = visitClient();
  assert.equal(await visitReq(c), RES);
  assert.match(c.calls[0][1].p_client_request_id, /^[0-9a-f-]{36}$/);
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'visit', scopeId: `${JOB}:${APP}` }), null);
});
test('missing reservation in readback or a non-UUID answer is not success, and the envelope is kept', async () => {
  await assert.rejects(visitReq(visitClient([])), /見学・体験予約結果/);
  assert.ok(await dm.loadDurableMutation({ userId: 'A', kind: 'visit', scopeId: `${JOB}:${APP}` }));
  await assert.rejects(visitReq(visitClient([], 'true')), /見学・体験予約結果/);
});
test('retrying the identical visit request reuses the request id; a changed time is refused', async () => {
  await assert.rejects(visitReq(visitClient([])));
  const kept = await dm.loadDurableMutation({ userId: 'A', kind: 'visit', scopeId: `${JOB}:${APP}` });
  await assert.rejects(visitReq(visitClient([]), { localTime: '10:30' }), (e) => dm.isDurableMutationPayloadMismatch(e));
  const c = visitClient(); await visitReq(c);
  assert.equal(c.calls[0][1].p_client_request_id, kept.requestId);
});
test('visit scope without an application is distinct from one with an application', async () => {
  await assert.rejects(visitReq(visitClient([]), { applicationId: null }));
  assert.ok(await dm.loadDurableMutation({ userId: 'A', kind: 'visit', scopeId: `${JOB}:none` }));
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'visit', scopeId: `${JOB}:${APP}` }), null);
});
test('cancel needs server true AND readback status cancelled', async () => {
  const ok = client({ hc_cancel_visit: { data: true, error: null }, hc_jobseeker_list_my_visits: { data: [{ reservation_id: RES, status: 'cancelled' }], error: null } });
  await api.cancelVisit(ok, RES);
  await assert.rejects(api.cancelVisit(client({ hc_cancel_visit: { data: false, error: null } }), RES), /キャンセルできませんでした/);
  const stale = client({ hc_cancel_visit: { data: true, error: null }, hc_jobseeker_list_my_visits: { data: [{ reservation_id: RES, status: 'confirmed' }], error: null } });
  await assert.rejects(api.cancelVisit(stale, RES), /キャンセル結果を確認できません/);
  await assert.rejects(api.cancelVisit(client({}), 'x'), /予約ID/);
});

// ---- attention summary and exact-target links ----------------------------------
test('attention counts are floored and never negative, NaN or fractional', async () => {
  const c = client({ hc_jobseeker_attention_summary: { data: { unanswered_interviews_count: 2.9, unread_messages_count: -4, pending_scouts_count: 'abc' }, error: null } });
  const s = await att.getJobseekerAttentionSummary(c);
  assert.deepEqual([s.unanswered_interviews_count, s.unread_messages_count, s.pending_scouts_count], [2, 0, 0]);
});
test('null/garbage attention payload becomes the empty summary, not an exception; RPC errors still throw', async () => {
  assert.equal((await att.getJobseekerAttentionSummary(client({ hc_jobseeker_attention_summary: { data: null, error: null } }))).unread_messages_count, 0);
  await assert.rejects(att.getJobseekerAttentionSummary(client({ hc_jobseeker_attention_summary: { data: null, error: new Error('down') } })), /down/);
});
test('interview link targets the exact interview; malformed ids fall back to the applications list', () => {
  const good = { ...att.emptyAttentionSummary, next_interview: { application_id: APP, interview_id: INT } };
  assert.equal(att.nativeAttentionInterviewHref(good), `/application/${APP}?focus=interview&interviewId=${INT}`);
  for (const bad of [{ application_id: '../../admin', interview_id: INT }, { application_id: APP, interview_id: 'x&focus=evil' }, { application_id: APP, interview_id: '' }]) {
    assert.equal(att.nativeAttentionInterviewHref({ ...att.emptyAttentionSummary, next_interview: bad }), '/(tabs)/applications');
  }
  assert.equal(att.nativeAttentionInterviewHref(att.emptyAttentionSummary), '/(tabs)/applications');
});
test('message link requires a valid application id', () => {
  assert.equal(att.nativeAttentionMessageHref({ ...att.emptyAttentionSummary, next_message: { application_id: APP } }), `/application/${APP}?focus=messages`);
  assert.equal(att.nativeAttentionMessageHref({ ...att.emptyAttentionSummary, next_message: { application_id: 'x/../y' } }), '/(tabs)/applications');
});

// ---- notification partial reads ----------------------------------------------
const ok = (value) => ({ status: 'fulfilled', value });
const ko = (reason) => ({ status: 'rejected', reason });
test('failed unread count is unknown (null), never zero, and raises a warning', () => {
  const r = snap.resolveCanonicalNotificationRead(ok([{ id: 1 }]), ko(new Error('x')), ok({ a: 1 }));
  assert.equal(r.unreadCount, null); assert.ok(r.warning); assert.equal(r.notifications.length, 1);
});
test('failed attention summary is unknown (null), never an empty summary', () => {
  const r = snap.resolveCanonicalNotificationRead(ok([]), ok(3), ko(new Error('x')));
  assert.equal(r.attentionSummary, null); assert.equal(r.unreadCount, 3); assert.ok(r.warning);
});
test('a failed list read throws: a failure is never presented as an empty inbox', () => {
  assert.throws(() => snap.resolveCanonicalNotificationRead(ko(new Error('list down')), ok(0), ok({})), /list down/);
});
test('all reads fine yields no warning and exact values (zero stays zero)', () => {
  const r = snap.resolveCanonicalNotificationRead(ok([]), ok(0), ok({ a: 1 }));
  assert.equal(r.unreadCount, 0); assert.equal(r.warning, null);
});
