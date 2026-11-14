import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumePdfFailureNotice, UNCONFIRMED_RESUME_PDF_NOTICE } from '../src/lib/resumePdfFailurePresentation.ts';

test('known PDF format errors keep fixed Japanese remediation', () => {
  assert.equal(resumePdfFailureNotice(new Error('作成された書類はPDF形式ではありません。')),
    '作成された書類はPDF形式ではありません。');
});
test('known revision conflict keeps explicit reload instruction', () => {
  const msg = '別の端末で履歴書が変更されました。最新データを読み込み直してください。';
  assert.equal(resumePdfFailureNotice(new Error(msg)), msg);
});
test('known uncertain readback demands list verification rather than automatic re-send', () => {
  const msg = '書類の保存結果を確認できませんでした。書類一覧を再読み込みしてください。';
  assert.equal(resumePdfFailureNotice(new Error(msg)), msg);
});
test('raw Storage errors cannot expose candidate id, bucket or path', () => {
  const msg = 'Bucket private-docs candidates/user-A/file.pdf failed at hc_register_generated';
  assert.equal(resumePdfFailureNotice(new Error(msg)), UNCONFIRMED_RESUME_PDF_NOTICE);
});
test('raw token, server SQL and unexpected object errors all use privacy-safe text', () => {
  for (const error of [new Error('token abc.secret'), new Error('column public.something does not exist'),
    { message: 'path private/user-B' }, null, 42, 'raw error']) {
    assert.equal(resumePdfFailureNotice(error), UNCONFIRMED_RESUME_PDF_NOTICE);
  }
});
test('prefix/suffix injection into allowlisted text must not pass', () => {
  assert.equal(resumePdfFailureNotice(new Error('作成された書類はPDF形式ではありません。 private-path')),
    UNCONFIRMED_RESUME_PDF_NOTICE);
});
