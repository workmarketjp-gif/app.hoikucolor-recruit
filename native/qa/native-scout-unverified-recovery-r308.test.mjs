import assert from 'node:assert/strict';
import test from 'node:test';
import { mayRecoverUnverifiedScoutInbox, mayRefreshVisibleScoutInbox, scoutNoticeAfterInboxRecovery } from '../src/lib/scoutVisibleRefreshPolicy.ts';

const state = (overrides = {}) => ({
  appActive: true, privateAllowed: true,
  ownerKey: 'synthetic-owner:sessionA', verifiedOwnerKey: 'synthetic-owner:sessionA',
  scoutsVerified: false, loading: false, busy: false,
  writePending: false, searchPending: false, refreshPending: false, ...overrides,
});

test('a failed inbox can quietly recover with a separately verified candidate owner', () => {
  assert.equal(mayRefreshVisibleScoutInbox(state()), false);
  assert.equal(mayRecoverUnverifiedScoutInbox(state()), true);
});
test('the existing verified inbox keeps its regular refresh path', () => {
  assert.equal(mayRecoverUnverifiedScoutInbox(state({scoutsVerified:true})), false);
  assert.equal(mayRefreshVisibleScoutInbox(state({scoutsVerified:true})), true);
});
test('signed-out, unverified and changed owner never start private recovery', () => {
  assert.equal(mayRecoverUnverifiedScoutInbox(state({verifiedOwnerKey:null})), false);
  assert.equal(mayRecoverUnverifiedScoutInbox(state({ownerKey:null,verifiedOwnerKey:null})), false);
  assert.equal(mayRecoverUnverifiedScoutInbox(state({ownerKey:'other:session'})), false);
});
test('locked or backgrounded candidate never starts recovery', () => {
  assert.equal(mayRecoverUnverifiedScoutInbox(state({privateAllowed:false})), false);
  assert.equal(mayRecoverUnverifiedScoutInbox(state({appActive:false})), false);
});
test('no recovery overlaps first load, mutation, search or another refresh', () => {
  for (const key of ['loading','busy','writePending','searchPending','refreshPending']) {
    assert.equal(mayRecoverUnverifiedScoutInbox(state({[key]:true})), false, key);
  }
});
test('recovery amends partial-load notice but never suppresses other errors', () => {
  const suffix = 'を確認できませんでした。確認できた項目のみ表示しています。再読み込みしてください。';
  assert.equal(scoutNoticeAfterInboxRecovery(`届いたスカウト${suffix}`,true,true),null);
  assert.equal(scoutNoticeAfterInboxRecovery(`届いたスカウト・公開範囲${suffix}`,false,true),`公開範囲${suffix}`);
  assert.equal(scoutNoticeAfterInboxRecovery(`届いたスカウト・公開範囲・希望条件${suffix}`,false,false),`公開範囲・希望条件${suffix}`);
  assert.equal(scoutNoticeAfterInboxRecovery('保存結果を確認してください。',true,true),'保存結果を確認してください。');
  assert.equal(scoutNoticeAfterInboxRecovery(null,true,true),null);
});
