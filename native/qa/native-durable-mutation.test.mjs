// Behavioural suite: ambiguous-write recovery envelopes (messages / interviews). Real durableMutation.ts and the
// real send/respond functions in applicationJourneyApi.ts, with in-memory SecureStore and a synthetic RPC client.
import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const href = (name) => pathToFileURL(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))).href;
const device = href('device-storage.stub.mjs');
registerHooks({ resolve(specifier, context, nextResolve) {
  if (['expo-secure-store', 'expo-crypto'].includes(specifier)) return nextResolve(device, context);
  if (specifier === './documentVaultApi' && context.parentURL?.includes('/src/lib/')) return nextResolve(href('journey-documentVaultApi.stub.mjs'), context);
  if (/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const dm = await import('../src/lib/durableMutation.ts');
const api = await import('../src/lib/applicationJourneyApi.ts');
const { fsState } = await import('./fixtures/device-storage.stub.mjs');

const APP = '22222222-2222-4222-8222-222222222222';
const INT = '33333333-3333-4333-8333-333333333333';
const lease = (u = 'A', s = 's1') => dm.captureDurableMutationSessionLease(u, s);
const prep = (o = {}) => dm.prepareDurableMutation({ userId: 'A', kind: 'message', scopeId: APP, payloadParts: [APP, 'hello'], lease: lease(), ...o });

beforeEach(() => { fsState.secure.clear(); fsState.secureUnavailable = false;
  for (const u of ['A', 'B']) dm.unblockDurableMutationSession(u, 's1'); });

test('same payload reuses the same request id (idempotent retry after process death)', async () => {
  const a = await prep(); const b = await prep();
  assert.equal(a.reusedRequestId, false); assert.equal(b.reusedRequestId, true);
  assert.equal(a.envelope.requestId, b.envelope.requestId);
});
test('a different payload for the same unresolved scope is refused, never overwritten', async () => {
  const first = await prep();
  await assert.rejects(prep({ payloadParts: [APP, 'different'] }), (e) => dm.isDurableMutationPayloadMismatch(e));
  assert.equal((await dm.loadDurableMutation({ userId: 'A', kind: 'message', scopeId: APP })).requestId, first.envelope.requestId);
});
test('envelope persists no plaintext of the payload', async () => {
  await prep({ payloadParts: [APP, 'SECRET-BODY-TEXT'] });
  assert.ok(![...fsState.secure.values()].some((v) => v.includes('SECRET-BODY-TEXT')));
});
test('envelopes are scoped per user, kind and scope id', async () => {
  await prep();
  assert.equal(await dm.loadDurableMutation({ userId: 'B', kind: 'message', scopeId: APP }), null);
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'interview', scopeId: APP }), null);
});
test('unavailable secure storage refuses to start a mutation instead of risking duplicates', async () => {
  fsState.secureUnavailable = true;
  await assert.rejects(prep(), /SECURE_STORE_UNAVAILABLE/);
});
test('lease for another owner is rejected', async () => {
  await assert.rejects(dm.prepareDurableMutation({ userId: 'A', kind: 'message', scopeId: APP, payloadParts: ['x'], lease: lease('B') }), /OWNER_MISMATCH/);
});
test('a blocked session cannot capture a lease, and an outstanding lease cannot commit', async () => {
  const l = lease();
  dm.blockDurableMutationSession('A', 's1');
  assert.throws(() => lease(), /BLOCKED|CHANGED|AUTH/);
  await assert.rejects(dm.prepareDurableMutation({ userId: 'A', kind: 'message', scopeId: APP, payloadParts: ['x'], lease: l }), /CHANGED|BLOCKED/);
  assert.equal(fsState.secure.size, 0, 'no envelope created by a stale session');
});
test('expired (older than 7 days), malformed and mismatched envelopes are discarded', async () => {
  await prep();
  const [key] = [...fsState.secure.keys()].filter((k) => k.includes('ambiguous-mutation.v1'));
  const env = JSON.parse(fsState.secure.get(key));
  fsState.secure.set(key, JSON.stringify({ ...env, createdAt: new Date(Date.now() - 8 * 86400000).toISOString() }));
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'message', scopeId: APP }), null);
  assert.equal(fsState.secure.has(key), false);
  fsState.secure.set(key, '{broken');
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'message', scopeId: APP }), null);
});
test('clearAll removes every tracked envelope for the owner only', async () => {
  await prep(); await prep({ kind: 'interview', scopeId: INT, payloadParts: ['x'] });
  await dm.prepareDurableMutation({ userId: 'B', kind: 'message', scopeId: APP, payloadParts: ['y'], lease: lease('B') });
  const r = await dm.clearAllDurableMutations('A');
  assert.deepEqual(r, { attempted: 2, cleared: 2 });
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'message', scopeId: APP }), null);
  assert.ok(await dm.loadDurableMutation({ userId: 'B', kind: 'message', scopeId: APP }));
});
test('clearAll blocks concurrent prepare for that owner until the purge completes', async () => {
  const purging = dm.clearAllDurableMutations('A');
  assert.throws(() => lease(), /BLOCKED|CHANGED|AUTH/);
  await purging;
  assert.doesNotThrow(() => lease());
});

// ---- message send ---------------------------------------------------------
function msgClient({ sendResult, listed } = {}) {
  const calls = [];
  return { calls, rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'hc_send_message_v2') return sendResult ?? { data: { id: 'm1' }, error: null };
    if (name === 'hc_jobseeker_list_application_messages' || /list.*messages/.test(name)) return { data: listed ?? [{ id: 'm1', sender_role: 'jobseeker', body: 'hello' }], error: null };
    throw new Error(`unexpected rpc ${name}`);
  } };
}
const send = (c, body = ' hello ') => api.sendApplicationMessageDurable({ client: c, ownerId: 'A', ownerSessionId: 's1', applicationId: APP, body });

test('message send validates input before touching storage or network', async () => {
  const c = msgClient();
  await assert.rejects(send(c, '   '), /メッセージを入力/);
  await assert.rejects(send(c, 'x'.repeat(4001)), /4000/);
  await assert.rejects(api.sendApplicationMessageDurable({ client: c, ownerId: 'A', ownerSessionId: 's1', applicationId: 'bad', body: 'x' }), /応募ID/);
  assert.equal(c.calls.length, 0); assert.equal(fsState.secure.size, 0);
});
test('confirmed send sends the durable request id, trimmed body, and clears the envelope', async () => {
  const c = msgClient();
  const m = await send(c);
  assert.equal(m.id, 'm1');
  const [name, args] = c.calls[0];
  assert.equal(name, 'hc_send_message_v2'); assert.equal(args.p_body, 'hello');
  assert.match(args.p_client_request_id, /^[0-9a-f-]{36}$/);
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'message', scopeId: APP }), null);
});
test('send error keeps the envelope so retrying the same text reuses the request id', async () => {
  await assert.rejects(send(msgClient({ sendResult: { data: null, error: { message: 'timeout' } } })));
  const kept = await dm.loadDurableMutation({ userId: 'A', kind: 'message', scopeId: APP });
  assert.ok(kept);
  const c = msgClient(); await send(c);
  assert.equal(c.calls[0][1].p_client_request_id, kept.requestId);
});
test('unconfirmed readback (missing / wrong body / wrong role) is not reported as sent and keeps the envelope', async () => {
  for (const listed of [[], [{ id: 'm1', sender_role: 'employer', body: 'hello' }], [{ id: 'm1', sender_role: 'jobseeker', body: 'other' }]]) {
    await assert.rejects(send(msgClient({ listed })), /メッセージ送信結果/);
  }
  assert.ok(await dm.loadDurableMutation({ userId: 'A', kind: 'message', scopeId: APP }));
});
test('a different body while an earlier send is unresolved is refused (no duplicate message risk)', async () => {
  await assert.rejects(send(msgClient({ sendResult: { data: null, error: { message: 'timeout' } } })));
  await assert.rejects(send(msgClient(), 'a different message'), (e) => dm.isDurableMutationPayloadMismatch(e));
});

// ---- interview response ---------------------------------------------------
function intClient({ detail }) {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push([name, args]);
    if (name === 'hc_jobseeker_respond_interview') return { data: null, error: null };
    return { data: detail, error: null }; } };
}
const respond = (c, o = {}) => api.respondToInterviewDurable({ client: c, ownerId: 'A', ownerSessionId: 's1', applicationId: APP, interviewId: INT, responseStatus: 'accepted', ...o });
test('interview response validation: reschedule needs a message; status must be known; message length capped', async () => {
  const c = intClient({ detail: {} });
  await assert.rejects(respond(c, { responseStatus: 'reschedule_requested' }), /希望日時/);
  await assert.rejects(respond(c, { responseStatus: 'declined' }), /面接への回答/);
  await assert.rejects(respond(c, { candidateMessage: 'x'.repeat(1001) }), /1000/);
  assert.equal(c.calls.length, 0);
});
test('interview response succeeds only when canonical readback shows the same answer', async () => {
  const good = { application: { id: APP }, interviews: [{ id: INT, candidate_response_status: 'accepted', candidate_response_message: null }], visits: [] };
  await respond(intClient({ detail: good }));
  assert.equal(await dm.loadDurableMutation({ userId: 'A', kind: 'interview', scopeId: INT }), null);
  const stale = { application: { id: APP }, interviews: [{ id: INT, candidate_response_status: null, candidate_response_message: null }], visits: [] };
  await assert.rejects(respond(intClient({ detail: stale })), /反映を確認できません/);
  assert.ok(await dm.loadDurableMutation({ userId: 'A', kind: 'interview', scopeId: INT }), 'envelope kept after unconfirmed write');
});
