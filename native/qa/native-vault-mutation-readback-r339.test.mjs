import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileCandidateVaultMutation } from '../src/lib/reconcileCandidateVaultMutation.ts';

const ownerId = 'synthetic-candidate-a';
const target = Object.freeze({ id: 'resume-id', jobseeker_clerk_user_id: ownerId, file_path: 'jobseekers/' + ownerId + '/resume-id/source.pdf', document_type: 'resume', is_default: false });
const afterDefault = Object.freeze({ ...target, is_default: true });
function setup(overrides = {}) {
  let mutations = 0;
  let reads = 0;
  let current = true;
  const options = {
    target, ownerId, action: 'made-default', isCurrent: () => current,
    mutate: async () => { mutations += 1; },
    readback: async () => { reads += 1; return [afterDefault]; },
    ...overrides,
  };
  return { options, counts: () => ({ mutations, reads }), revoke: () => { current = false; } };
}
test('confirmed default change returns exact canonical rows and changes once', async () => {
  const s = setup();
  assert.deepEqual(await reconcileCandidateVaultMutation(s.options), [afterDefault]);
  assert.deepEqual(s.counts(), { mutations: 1, reads: 1 });
});
test('lost RPC response after commit still resolves by canonical readback without retry', async () => {
  let calls = 0;
  const s = setup({ mutate: async () => { calls++; throw new Error('network lost'); } });
  assert.deepEqual(await reconcileCandidateVaultMutation(s.options), [afterDefault]);
  assert.equal(calls, 1);
});
test('failed RPC with unconfirmed default does not claim success or replay write', async () => {
  let calls = 0;
  const s = setup({ mutate: async () => { calls++; throw new Error('timeout'); }, readback: async () => [target] });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /再読み込み/);
  assert.equal(calls, 1);
});
test('a failed canonical read cannot be interpreted as an empty vault', async () => {
  const s = setup({ readback: async () => { throw new Error('network'); } });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
});
test('null canonical response cannot unlock success', async () => {
  const s = setup({ readback: async () => null });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
});
test('cross-candidate canonical response is never accepted', async () => {
  const s = setup({ readback: async () => [{ ...afterDefault, jobseeker_clerk_user_id: 'synthetic-candidate-b' }] });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
});
test('replacement with same row ID but changed private Storage key is not proof', async () => {
  const s = setup({ readback: async () => [{ ...afterDefault, file_path: 'jobseekers/other.pdf' }] });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
});
test('wrong document type cannot confirm default', async () => {
  const s = setup({ readback: async () => [{ ...afterDefault, document_type: 'qualification' }] });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
});
test('revoked session before mutation blocks all traffic', async () => {
  let calls = 0;
  const s = setup({ isCurrent: () => false, mutate: async () => { calls++; }, readback: async () => { calls++; return []; } });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /権限/);
  assert.equal(calls, 0);
});
test('owner mismatch before mutation blocks all traffic', async () => {
  let calls = 0;
  const s = setup({ ownerId: 'synthetic-candidate-b', mutate: async () => { calls++; } });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /権限/);
  assert.equal(calls, 0);
});
test('session changes while RPC runs, no subsequent private read', async () => {
  let reads = 0;
  let current = true;
  const s = setup({ isCurrent: () => current, mutate: async () => { current = false; }, readback: async () => { reads++; return [afterDefault]; } });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /権限/);
  assert.equal(reads, 0);
});
test('session changes during readback, no stale success', async () => {
  let current = true;
  const s = setup({ isCurrent: () => current, readback: async () => { current = false; return [afterDefault]; } });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
});
test('delete requires confirmed canonical absence', async () => {
  const s = setup({ action: 'deleted', readback: async () => [] });
  assert.deepEqual(await reconcileCandidateVaultMutation(s.options), []);
});
test('ambiguous delete response and empty readback never claim deletion: RLS may hide rows', async () => {
  let calls = 0;
  const s = setup({ action: 'deleted', mutate: async () => { calls++; throw new Error('timed out'); }, readback: async () => [] });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
  assert.equal(calls, 1);
});
test('row remains after attempted delete: do not claim removal', async () => {
  const s = setup({ action: 'deleted', readback: async () => [target] });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /再読み込み/);
});
test('delete does not accept a wrong-owner tombstone-like response', async () => {
  const s = setup({ action: 'deleted', readback: async () => [{ ...target, id: 'other', jobseeker_clerk_user_id: 'synthetic-candidate-b' }] });
  await assert.rejects(reconcileCandidateVaultMutation(s.options), /確認できません/);
});
