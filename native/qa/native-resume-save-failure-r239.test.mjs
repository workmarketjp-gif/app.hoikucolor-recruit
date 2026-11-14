import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resumeSaveFailureDecision, UNCONFIRMED_RESUME_SAVE_NOTICE,
} from '../src/lib/resumeSaveFailurePolicy.ts';

const decide = (error, started = true) => resumeSaveFailureDecision(error, started);

test('before RPC starts, failed Clerk preflight does not imply a save', () => {
  const decision = decide(new Error('private Clerk token user-A'), false);
  assert.equal(decision.requiresReload, false);
  assert.match(decision.notice, /保存前のログイン確認/);
  assert.doesNotMatch(decision.notice, /user-A|private|Clerk/);
});

test('unknown RPC response quarantines the draft until explicit canonical reload', () => {
  for (const error of [new Error('network failed uid=ABC'), { message: 'private path' }, null, 'unknown', 500]) {
    assert.deepEqual(decide(error), { notice: UNCONFIRMED_RESUME_SAVE_NOTICE, requiresReload: true });
  }
});

test('unknown server success/readback failure never prompts a second blind write', () => {
  const decision = decide(Object.assign(new Error('file:///private/resume'), { name: 'ResumeReadbackUnconfirmed' }));
  assert.deepEqual(decision, { notice: UNCONFIRMED_RESUME_SAVE_NOTICE, requiresReload: true });
});

test('optimistic revision conflict requires server refresh before resubmission', () => {
  const decision = decide(Object.assign(new Error('RPC details'), { name: 'ResumeRevisionConflict' }));
  assert.equal(decision.requiresReload, true);
  assert.match(decision.notice, /先に保存されました/);
  assert.doesNotMatch(decision.notice, /RPC/);
});

test('only exact approved validation errors permit editing/retry without canonical reload', () => {
  for (const message of ['文字数が多すぎる項目があります。短くしてから保存してください。', '生年月日を確認してください。']) {
    assert.deepEqual(decide(new Error(message)), { notice: message, requiresReload: false });
    assert.equal(decide(new Error(`${message} id=private`)).requiresReload, true);
  }
});

test('account deletion refuses draft requeue', () => {
  assert.deepEqual(decide(new Error('退会手続き中のため保存できません。')),
    { notice: '退会手続き中のため保存できません。', requiresReload: true });
});

test('untrusted Error subclass with throwing accessors cannot leak private identifiers', () => {
  class MaliciousError extends Error { get name() { throw new Error('user-B path'); } }
  assert.deepEqual(decide(new MaliciousError()), { notice: UNCONFIRMED_RESUME_SAVE_NOTICE, requiresReload: true });
});
