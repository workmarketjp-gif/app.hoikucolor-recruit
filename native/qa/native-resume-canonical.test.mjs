import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCandidateResume, toResumePayload, getCandidateResume, saveCandidateResumeAndConfirm, ResumeRevisionConflict, ResumeReadbackUnconfirmed } from '../src/lib/resumeCanonical.ts';

const base = normalizeCandidateResume({ revision: 4, birth_date: '1990-05-01', education: [{ id: 'a', organization: '学校', start_ym: '2021-04' }], employment: [] });
const clone = (x) => structuredClone(x);
const rpc = (values) => { const calls = []; return { calls, client: { rpc: async (name, args) => { calls.push({ name, args }); return values.shift(); } } }; };

test('invalid nested values normalize without fabricated records', () => {
  const r = normalizeCandidateResume({ education: [null, 8, { organization: '学校', start_ym: '2020-13' }], employment: [false] });
  assert.equal(r.education.length, 1); assert.equal(r.employment.length, 0); assert.equal(r.education[0].start_ym, null);
});
test('preserves candidate education and employment facts', () => {
  const r = normalizeCandidateResume({ revision: 8, education: [{ id: 'a', organization: '学校', end_ym: '2024-03', education_status: '卒業' }], employment: [{ id: 'x', organization: '園', age_groups: ['0歳児'], class_lead: true }] });
  assert.equal(r.education[0].education_status, '卒業'); assert.equal(r.employment[0].age_groups[0], '0歳児'); assert.equal(r.employment[0].class_lead, true);
});
test('filters empty draft rows while preserving real work history', () => {
  const r = clone(base); r.employment.push({ organization: '  ', id: 'draft' }); r.employment.push({ organization: '保育園', id: 'live' });
  assert.deepEqual(toResumePayload(r).employment.map((x) => x.id), ['live']); assert.equal('revision' in toResumePayload(r), false);
});
test('GET uses authoritative candidate-scoped RPC only', async () => {
  const { client, calls } = rpc([{ data: base, error: null }]);
  assert.equal((await getCandidateResume(client)).revision, 4); assert.deepEqual(calls, [{ name: 'hc_jobseeker_get_resume', args: undefined }]);
});
test('confirmed save sends expected revision, canonical GET and returns verified state', async () => {
  const canonical = { ...base, revision: 5, updated_at: '2026-11-06T01:00:00Z' };
  const { client, calls } = rpc([{ data: canonical, error: null }, { data: canonical, error: null }]);
  assert.equal((await saveCandidateResumeAndConfirm(client, base)).revision, 5);
  assert.equal(calls.length, 2); assert.equal(calls[0].name, 'hc_jobseeker_save_resume');
  assert.equal(calls[0].args.p_expected_revision, 4); assert.equal(calls[1].name, 'hc_jobseeker_get_resume');
});
test('rejects optimistic revision conflict without retry', async () => {
  const { client, calls } = rpc([{ data: null, error: { message: 'HC_RESUME_REVISION_CONFLICT' } }]);
  await assert.rejects(saveCandidateResumeAndConfirm(client, base), ResumeRevisionConflict); assert.equal(calls.length, 1);
});
test('rejects ambiguous server failure without retry', async () => {
  const { client, calls } = rpc([{ data: null, error: { message: 'network' } }]);
  await assert.rejects(saveCandidateResumeAndConfirm(client, base), ResumeReadbackUnconfirmed); assert.equal(calls.length, 1);
});
test('does not claim saved when follow-up canonical read fails', async () => {
  const { client, calls } = rpc([{ data: {}, error: null }, { data: null, error: { message: 'offline' } }]);
  await assert.rejects(saveCandidateResumeAndConfirm(client, base), ResumeReadbackUnconfirmed); assert.equal(calls.length, 2);
});
test('does not accept stale revision or divergent canonical content', async () => {
  for (const record of [{ ...base }, { ...base, revision: 5, address: '別の住所' }]) {
    const { client, calls } = rpc([{ data: {}, error: null }, { data: record, error: null }]);
    await assert.rejects(saveCandidateResumeAndConfirm(client, base), ResumeReadbackUnconfirmed); assert.equal(calls.length, 2);
  }
});
