import assert from 'node:assert/strict';
import test from 'node:test';
import { presentProfilePrewriteFailure } from '../src/lib/profileSaveFailurePresentation.ts';

const known = [
  '経験年数は0〜80の数字で入力してください。',
  'お名前を入力してください。',
  '勤務開始希望日はYYYY-MM-DD形式で入力してください。',
  '勤務開始希望日を確認してください。',
];

test('local Web-aligned form validation retains actionable Japanese wording', () => {
  for (const message of known) assert.equal(presentProfilePrewriteFailure(message), message);
});

test('untrusted server error text and candidate identifiers cannot appear in pre-write UI', () => {
  const secrets = ['synthetic-clerk-jwt', 'candidate-document-123', 'rpc_table_internal'];
  for (const value of [null, '', ...secrets, secrets.join(' '), 'CANDIDATE_SESSION_CHANGED']) {
    const shown = presentProfilePrewriteFailure(value);
    assert.ok(shown.includes('保存準備'));
    for (const secret of secrets) assert.equal(shown.includes(secret), false);
  }
});

test('unrecognized validation text fails closed rather than echoing private details', () => {
  assert.equal(presentProfilePrewriteFailure('database: private table'),
    'プロフィールの保存準備ができませんでした。ログイン状態・通信状態を確認して再度お試しください。');
});
