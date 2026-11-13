import assert from 'node:assert/strict';
import test from 'node:test';
import { readIndependentScoutSections } from '../src/lib/scoutIndependentSections.ts';

const make = (overrides = {}) => {
  const counts = { scouts: 0, privacy: 0, preferences: 0 };
  const state = { current: true };
  const opts = {
    loadScouts: async () => { counts.scouts++; return [{ scout_id: 'synthetic-sc-A' }]; },
    loadPrivacy: async () => { counts.privacy++; return { scout_opt_in: true }; },
    loadPreferences: async () => { counts.preferences++; return { desired_cities: ['synthetic-city'] }; },
    isCurrent: () => state.current,
    ...overrides,
  };
  return { counts, state, opts };
};

test('all three verified canonical sections return their real distinct values', async () => {
  const f = make();
  const result = await readIndependentScoutSections(f.opts);
  assert.deepEqual(result, {
    scouts: { status: 'fulfilled', value: [{ scout_id: 'synthetic-sc-A' }] },
    privacy: { status: 'fulfilled', value: { scout_opt_in: true } },
    preferences: { status: 'fulfilled', value: { desired_cities: ['synthetic-city'] } },
  });
  assert.deepEqual(f.counts, { scouts: 1, privacy: 1, preferences: 1 });
});

test('privacy failure does not hide the scout inbox or verified preferences', async () => {
  const f = make({ loadPrivacy: () => Promise.reject(Error('synthetic privacy RPC failure')) });
  const result = await readIndependentScoutSections(f.opts);
  assert.equal(result?.scouts.status, 'fulfilled');
  assert.deepEqual(result?.privacy, { status: 'rejected' });
  assert.equal(result?.preferences.status, 'fulfilled');
});

test('scout error never becomes empty or a fabricated 0 pending count', async () => {
  const f = make({ loadScouts: () => Promise.reject(Error('synthetic scout RPC failure')) });
  const result = await readIndependentScoutSections(f.opts);
  assert.deepEqual(result?.scouts, { status: 'rejected' });
  assert.equal('value' in result.scouts, false);
  assert.equal(result.privacy.status, 'fulfilled');
});

test('preferences error never becomes an editable default record', async () => {
  const f = make({ loadPreferences: () => Promise.reject(Error('synthetic preference RPC failure')) });
  const result = await readIndependentScoutSections(f.opts);
  assert.deepEqual(result?.preferences, { status: 'rejected' });
  assert.equal(result?.scouts.status, 'fulfilled');
  assert.equal(result?.privacy.status, 'fulfilled');
});

test('no candidate-private RPC launches for an already invalid view', async () => {
  const f = make({ isCurrent: () => false });
  assert.equal(await readIndependentScoutSections(f.opts), null);
  assert.deepEqual(f.counts, { scouts: 0, privacy: 0, preferences: 0 });
});

test('revocation before microtask launch prevents all three RPC launches', async () => {
  const f = make();
  const promise = readIndependentScoutSections(f.opts);
  f.state.current = false;
  assert.equal(await promise, null);
  assert.deepEqual(f.counts, { scouts: 0, privacy: 0, preferences: 0 });
});

test('revocation during in-flight read never publishes another candidate snapshot', async () => {
  let resolve;
  const deferred = new Promise(done => {resolve=done;});
  const f = make({loadScouts:()=>deferred});
  const promise = readIndependentScoutSections(f.opts);
  await new Promise(resolve => setImmediate(resolve));
  f.state.current = false;
  resolve([{scout_id:'synthetic-stale'}]);
  assert.equal(await promise, null);
});

test('one hanging candidate RPC times out while independent successful sections remain verified', async () => {
  const f = make({loadPrivacy:()=>new Promise(()=>{}),timeoutMs:12});
  const result = await readIndependentScoutSections(f.opts);
  assert.deepEqual(result?.privacy, {status:'rejected'});
  assert.equal(result?.scouts.status,'fulfilled');
  assert.equal(result?.preferences.status,'fulfilled');
});

test('all failed sections remain rejected, never synthesized as empty', async () => {
  const f = make({loadScouts:()=>Promise.reject(Error('a')),loadPrivacy:()=>Promise.reject(Error('b')),loadPreferences:()=>Promise.reject(Error('c'))});
  assert.deepEqual(await readIndependentScoutSections(f.opts),{
    scouts:{status:'rejected'}, privacy:{status:'rejected'},preferences:{status:'rejected'},
  });
});
