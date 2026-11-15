import test from 'node:test';
import assert from 'node:assert/strict';
import { careerMutationFailure, careerReadFailure } from '../src/lib/careerMutationRecovery.ts';

test('a failed token/client preflight is not represented as a committed write', () => {
  const recovery = careerMutationFailure(false);
  assert.equal(recovery.requiresCanonicalReload, false);
  assert.match(recovery.notice, /開始していません/);
});

test('save RPC failure is ambiguous; an explicit owner-pinned canonical reload is required', () => {
  const recovery = careerMutationFailure(true);
  assert.equal(recovery.requiresCanonicalReload, true);
  assert.match(recovery.notice, /保存状況を再確認/);
  assert.doesNotMatch(recovery.notice, /失敗しました/);
});

test('delete RPC/readback failure uses the same no-duplicate-write gate', () => {
  assert.deepEqual(careerMutationFailure(true), careerMutationFailure(true));
});

test('none of the user-facing errors echo sensitive upstream text', () => {
  const privateError = 'POST /rest/v1/rpc?...token=secret-id; private@example.jp';
  for (const message of [careerMutationFailure(true).notice, careerMutationFailure(false).notice, careerReadFailure()]) {
    assert.equal(message.includes(privateError), false);
    assert.equal(message.includes('rpc'), false);
    assert.equal(message.includes('token'), false);
    assert.equal(message.includes('private@example.jp'), false);
  }
});

test('a canonical read failure is not presented as a zero result', () => {
  assert.match(careerReadFailure(), /再読み込み/);
});
