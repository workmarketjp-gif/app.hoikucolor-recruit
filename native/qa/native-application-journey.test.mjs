// Behavioural suite: application submission journey against the real applicationJourneyApi.ts
// with a synthetic RPC client. No network, no real candidate data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const fixture = (name) => pathToFileURL(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))).href;
const stubs = {
  './documentVaultApi': fixture('journey-documentVaultApi.stub.mjs'),
  './durableMutation': fixture('journey-durableMutation.stub.mjs'),
};
registerHooks({ resolve(specifier, context, nextResolve) {
  if (stubs[specifier] && context.parentURL?.includes('/src/lib/')) return nextResolve(stubs[specifier], context);
  if (/^\.\/[A-Za-z]+$/.test(specifier) && context.parentURL?.includes('/src/lib/')) return nextResolve(`${specifier}.ts`, context);
  return nextResolve(specifier, context);
} });
const api = await import('../src/lib/applicationJourneyApi.ts');
const vault = await import('./fixtures/journey-documentVaultApi.stub.mjs');

const JOB = '11111111-1111-4111-8111-111111111111';
const APP = '22222222-2222-4222-8222-222222222222';
const profile = (o = {}) => ({ name: ' 山田 花子 ', name_kana: null, email: 'a@example.test', phone: '', qualifications: ['保育士'],
  years_of_experience: 3, desired_start_date: null, self_intro: ' ', ...o });
function client({ submit = { data: APP, error: null }, detail } = {}) {
  const calls = [];
  return { calls, rpc: async (name, args) => {
    calls.push([name, args]);
    if (name.startsWith('hc_jobseeker_submit_application')) return typeof submit === 'function' ? submit(name) : submit;
    if (name === 'hc_jobseeker_get_application_detail') return { data: detail ?? { application: { id: APP, job_id: JOB }, interviews: [], visits: [] }, error: null };
    throw new Error(`unexpected rpc ${name}`);
  } };
}
const reset = () => Object.assign(vault.state, { documents: [], attachFail: new Set(), attached: [], expectations: [], submitted: [] });

test('blank profile name is rejected before any RPC', async () => {
  const c = client();
  await assert.rejects(api.submitApplication(c, JOB, profile({ name: '  ' })), /お名前/);
  assert.equal(c.calls.length, 0);
});
test('non-UUID job id is rejected before any RPC', async () => {
  const c = client();
  await assert.rejects(api.submitApplication(c, 'not-a-uuid', profile()), /求人ID/);
  assert.equal(c.calls.length, 0);
});
test('submit trims identity fields, nulls blanks and never sends caller identity', async () => {
  reset();
  const c = client();
  await api.submitApplication(c, JOB, profile());
  const [name, args] = c.calls[0];
  assert.equal(name, 'hc_jobseeker_submit_application');
  assert.equal(args.p_applicant_name, '山田 花子');
  assert.equal(args.p_phone, null);
  assert.equal(args.p_message, null);
  assert.equal(args.p_qualifications, '保育士');
  assert.ok(!Object.keys(args).some((k) => /user|candidate|owner/i.test(k)));
});
test('success requires canonical readback of the same job', async () => {
  reset();
  const c = client();
  const r = await api.submitApplication(c, JOB, profile());
  assert.equal(r.applicationId, APP);
  assert.deepEqual(c.calls.map(([n]) => n), ['hc_jobseeker_submit_application', 'hc_jobseeker_get_application_detail']);
});
test('ambiguous result: readback for a different job is not reported as success', async () => {
  reset();
  const c = client({ detail: { application: { id: APP, job_id: '33333333-3333-4333-8333-333333333333' }, interviews: [], visits: [] } });
  await assert.rejects(api.submitApplication(c, JOB, profile()), /応募結果を確認できませんでした/);
});
test('ambiguous result: non-UUID RPC payload is not reported as success', async () => {
  reset();
  await assert.rejects(api.submitApplication(client({ submit: { data: 'ok', error: null } }), JOB, profile()), /応募結果/);
  await assert.rejects(api.submitApplication(client({ submit: { data: null, error: null } }), JOB, profile()), /応募結果/);
});
test('RPC error propagates and attaches nothing', async () => {
  reset(); vault.state.documents = [{ id: 'd1', is_default: true }];
  await assert.rejects(api.submitApplication(client({ submit: { data: null, error: { message: 'boom' } } }), JOB, profile()));
  assert.equal(vault.state.attached.length, 0);
});
test('selected documents are deduplicated, sent via v2, and only selected ones attach', async () => {
  reset(); vault.state.documents = [{ id: 'd1', is_default: false }, { id: 'd2', is_default: true }, { id: 'd3', is_default: false }];
  const c = client();
  const r = await api.submitApplication(c, JOB, profile(), { documentIds: ['d1', 'd1', 'd3'] });
  assert.equal(c.calls[0][0], 'hc_jobseeker_submit_application_v2');
  assert.deepEqual(c.calls[0][1].p_document_ids, ['d1', 'd3']);
  assert.deepEqual(vault.state.attached.map(([d]) => d).sort(), ['d1', 'd3']);
  assert.equal(r.documentHandoffFailures, 0);
});
test('without selection only default vault documents attach', async () => {
  reset(); vault.state.documents = [{ id: 'd1', is_default: false }, { id: 'd2', is_default: true }];
  await api.submitApplication(client(), JOB, profile());
  assert.deepEqual(vault.state.attached.map(([d]) => d), ['d2']);
});
test('partial attach failure still returns the application and counts failures', async () => {
  reset(); vault.state.documents = [{ id: 'd1', is_default: true }, { id: 'd2', is_default: true }]; vault.state.attachFail.add('d2');
  const r = await api.submitApplication(client(), JOB, profile());
  assert.equal(r.applicationId, APP);
  assert.equal(r.documentHandoffFailures, 1);
});
test('v2 RPC missing falls back to v1', async () => {
  reset();
  const c = client({ submit: (n) => n.endsWith('_v2') ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : { data: APP, error: null } });
  const r = await api.submitApplication(c, JOB, profile(), { documentIds: [] });
  assert.equal(r.applicationId, APP);
  assert.deepEqual(c.calls.slice(0, 2).map(([n]) => n), ['hc_jobseeker_submit_application_v2', 'hc_jobseeker_submit_application']);
});
test('handoff state and repair reattach only missing vault sources', async () => {
  reset();
  vault.state.expectations = [{ source_jobseeker_document_id_snapshot: 's1' }, { source_jobseeker_document_id_snapshot: 's2' }];
  vault.state.submitted = [{ source_jobseeker_document_id: 's1' }];
  vault.state.documents = [{ id: 's1' }, { id: 's2' }];
  const state = await api.getApplicationDocumentHandoffState(client(), APP);
  assert.deepEqual(state, { expectedCount: 2, submittedFromVaultCount: 1, missingSourceDocumentIds: ['s2'] });
  const { failed } = await api.repairApplicationDocumentHandoff(client(), APP);
  assert.equal(failed, 0);
  assert.deepEqual(vault.state.attached, [['s2', APP]]);
});
test('repair reports failure when the source vault document is gone', async () => {
  reset();
  vault.state.expectations = [{ source_jobseeker_document_id_snapshot: 'gone' }];
  const { failed } = await api.repairApplicationDocumentHandoff(client(), APP);
  assert.equal(failed, 1);
});
test('application detail with mismatched id is rejected', async () => {
  const c = client({ detail: { application: { id: '44444444-4444-4444-8444-444444444444' } } });
  await assert.rejects(api.getApplicationDetail(c, APP), /整合性/);
});
