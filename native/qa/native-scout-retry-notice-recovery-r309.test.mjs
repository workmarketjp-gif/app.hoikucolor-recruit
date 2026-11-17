import assert from 'node:assert/strict';
import test from 'node:test';
import { scoutNoticeAfterInboxRecovery } from '../src/lib/scoutVisibleRefreshPolicy.ts';

const initial = 'を確認できませんでした。確認できた項目のみ表示しています。再読み込みしてください。';
const retry = 'を確認できませんでした。確認済みの入力内容は保持しています。';

test('quiet canonical inbox recovery clears an explicit retry failure notice', () => {
  assert.equal(scoutNoticeAfterInboxRecovery('届いたスカウト' + retry, true, true), null);
});

test('partial retry notice retains only remaining unverified panels', () => {
  assert.equal(
    scoutNoticeAfterInboxRecovery('届いたスカウト・公開範囲・希望条件' + retry, false, true),
    '公開範囲' + retry,
  );
  assert.equal(
    scoutNoticeAfterInboxRecovery('届いたスカウト・希望条件' + retry, true, false),
    '希望条件' + retry,
  );
});

test('initial failure wording still follows the original recovery contract', () => {
  assert.equal(scoutNoticeAfterInboxRecovery('届いたスカウト' + initial, true, true), null);
});

test('unrelated errors and manipulated prefixes are not cleared by a quiet read', () => {
  const unrelated = [
    '保存結果を確認してください。届いたスカウト' + retry,
    '指定された届いたスカウト' + initial,
    '届いたスカウト・法人の検索' + retry,
    '届いたスカウト' + retry + ' 再送信しないでください。',
    '操作結果を確認できませんでした。再読み込みして最新の状態をご確認ください。',
  ];
  for (const value of unrelated) {
    assert.equal(scoutNoticeAfterInboxRecovery(value, true, true), value);
  }
  assert.equal(scoutNoticeAfterInboxRecovery(null, true, true), null);
});

test('no server error text or owner identity is parsed into notice', () => {
  const hostile = 'candidate-123-private-path/届いたスカウト' + retry;
  assert.equal(scoutNoticeAfterInboxRecovery(hostile, true, true), hostile);
});
