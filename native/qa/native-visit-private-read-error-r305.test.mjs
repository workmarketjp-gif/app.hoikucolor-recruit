import assert from 'node:assert/strict';
import test from 'node:test';
import { readCandidateVisitSnapshot } from '../src/lib/candidateVisitSnapshotRead.ts';
import { safeVisitErrorMessage } from '../src/lib/visitErrorPresentation.ts';

const owner = (u, s) => `${u}:${s}`;
const make = (overrides = {}) => {
  let active = true;
  let visitsCalls = 0;
  let settingsCalls = 0;
  const options = {
    expectedOwnerKey: 'person:session', resolveOwnerKey: owner,
    isScreenCurrent: () => active,
    pin: async () => ({ ownerId: 'person', ownerSessionId: 'session', client: { token: 'synthetic' }, isCurrent: () => active }),
    listVisits: async () => { visitsCalls++; return ['a', 'b']; },
    readSettings: async () => { settingsCalls++; return { visit_enabled: true }; },
    timeoutMs: 45,
    ...overrides,
  };
  return { options, deactivate: () => { active = false; }, calls: () => [visitsCalls, settingsCalls] };
};

test('one owner-pinned canonical snapshot includes BOTH successful sources', async () => {
  const { options, calls } = make();
  assert.deepEqual(await readCandidateVisitSnapshot(options), { ownerKey:'person:session', visits:['a','b'], settings:{visit_enabled:true} });
  assert.deepEqual(calls(), [1, 1]);
});
test('wrong owner cannot initiate either private RPC', async () => {
  const { options, calls } = make({expectedOwnerKey:'other:session'});
  await assert.rejects(readCandidateVisitSnapshot(options));
  assert.deepEqual(calls(), [0, 0]);
});
test('screen revoked before token resolution rejects without private RPCs', async () => {
  const b = make({ pin: async () => { b.deactivate(); return {client: {}, ownerId:'person',ownerSessionId:'session',isCurrent:()=>true}; } });
  await assert.rejects(readCandidateVisitSnapshot(b.options));
  assert.deepEqual(b.calls(), [0, 0]);
});
test('screen revoked during microtask before actual RPC launch', async () => {
  const b = make({ pin: async () => { queueMicrotask(()=>b.deactivate()); return {client:{}, ownerId:'person', ownerSessionId:'session',isCurrent:()=>true}; } });
  await assert.rejects(readCandidateVisitSnapshot(b.options));
  assert.deepEqual(b.calls(), [0,0]);
});
test('one hanging canonical reservation read expires without endless spinner', async () => {
  const b = make({listVisits: async () => new Promise(()=>{}), timeoutMs: 6});
  await assert.rejects(readCandidateVisitSnapshot(b.options), /タイムアウト/);
});
test('one hanging job-settings read expires without endless spinner', async () => {
  const b = make({readSettings: async () => new Promise(()=>{}), timeoutMs: 6});
  await assert.rejects(readCandidateVisitSnapshot(b.options), /タイムアウト/);
});
test('no unhandled late rejection after timeout; never present delayed snapshot', async () => {
  let rejectLate;
  const b = make({readSettings: ()=>new Promise((_,reject)=>{rejectLate=reject}), timeoutMs:7});
  await assert.rejects(readCandidateVisitSnapshot(b.options), /タイムアウト/);
  rejectLate(new Error('private-storage-path'));
  await new Promise(r=>setTimeout(r,0));
});
test('private read is denied before pin when view already revoked', async () => {
  const b = make(); b.deactivate();
  await assert.rejects(readCandidateVisitSnapshot(b.options));
  assert.deepEqual(b.calls(), [0,0]);
});
test('opaque errors never leak private paths, URLs or getters into visit banners', () => {
  const leak = 'clerk_user_007 private/candidates/token.pdf https://storage.example/?signed=secret';
  const hostile = {get message(){throw new Error('getter must not be executed')}};
  for (const stage of ['load','readback_request','readback_cancel','request','cancel']) {
    const rendered = safeVisitErrorMessage(stage, hostile);
    assert.equal(typeof rendered,'string');
    assert.ok(!rendered.includes(leak));
    assert.ok(!rendered.includes('secret'));
    assert.ok(!safeVisitErrorMessage(stage,new Error(leak)).includes('storage'));
  }
});
test('post-request/cancel uncertainty is explicit; never suggests blind retry', () => {
  assert.match(safeVisitErrorMessage('readback_request',null), /再申込せず/);
  assert.match(safeVisitErrorMessage('readback_cancel',null), /再操作せず/);
  assert.match(safeVisitErrorMessage('request',null), /重複申込/);
  assert.match(safeVisitErrorMessage('cancel',null), /再操作せず/);
});
