import assert from 'node:assert/strict';
import test from 'node:test';
import { readIndependentScoutSections, scoutInitialLoadFailureMessage } from '../src/lib/scoutIndependentSections.ts';

const input = (overrides = {}) => ({
  loadScouts: async () => ['synthetic-scout'],
  loadPrivacy: async () => ({ scout_opt_in: false }),
  loadPreferences: async () => ({ desired_prefectures: ['東京都'] }),
  isCurrent: () => true,
  timeoutMs: 30,
  ...overrides,
});

test('initial scout error never reproduces backend private data', () => {
  const secret = 'candidate_123 private/candidate/secret.pdf https://storage.invalid/?token=secret';
  const notice = scoutInitialLoadFailureMessage(new Error(secret));
  assert.match(notice, /スカウト情報を読み込めませんでした/);
  assert.equal(notice.includes('candidate_123'), false);
  assert.equal(notice.includes('secret'), false);
  assert.equal(notice.includes('storage.invalid'), false);
});
test('initial error presentation never examines hostile exception getters', () => {
  const hostile = { get message() { throw new Error('must not touch'); }, get stack() { throw new Error('must not touch'); } };
  assert.doesNotThrow(() => scoutInitialLoadFailureMessage(hostile));
  assert.equal(scoutInitialLoadFailureMessage(hostile), scoutInitialLoadFailureMessage(null));
});
test('each independent section returns canonical fulfilled results', async () => {
  const result = await readIndependentScoutSections(input());
  assert.deepEqual(result, {
    scouts: {status:'fulfilled',value:['synthetic-scout']},
    privacy: {status:'fulfilled',value:{scout_opt_in:false}},
    preferences: {status:'fulfilled',value:{desired_prefectures:['東京都']}},
  });
});
test('failed private scout inbox never means empty inbox or removes valid settings', async () => {
  const result = await readIndependentScoutSections(input({ loadScouts: async () => { throw new Error('private_storage/identifier'); } }));
  assert.deepEqual(result.scouts, {status:'rejected'});
  assert.equal(result.privacy.status,'fulfilled');
  assert.equal(result.preferences.status,'fulfilled');
  assert.equal(scoutInitialLoadFailureMessage(new Error('private_storage/identifier')).includes('private_storage'),false);
});
test('one hung section returns rejected within deadline and leaves others available', async () => {
  const result = await readIndependentScoutSections(input({loadPrivacy: ()=>new Promise(()=>{}),timeoutMs:5}));
  assert.deepEqual(result.privacy,{status:'rejected'});
  assert.equal(result.scouts.status,'fulfilled');
});
test('revoked view cannot initiate private requests', async () => {
  let count = 0;
  const result = await readIndependentScoutSections(input({isCurrent:()=>false,loadScouts:async()=>{count++; return []}}));
  assert.equal(result,null);
  assert.equal(count,0);
});
test('revoking active view before settlement suppresses all private results', async () => {
  let active = true;
  const result = await readIndependentScoutSections(input({
    isCurrent:()=>active,
    loadScouts:async()=>{active=false;return ['secret'];},
  }));
  assert.equal(result,null);
});
