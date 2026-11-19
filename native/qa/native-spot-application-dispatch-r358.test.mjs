import test from 'node:test';
import assert from 'node:assert/strict';
import { armSpotApplicationDispatch } from '../src/lib/spotApplicationDispatch.ts';

const setup = (extra = {}) => ({ isCurrent: () => true, armPending: async () => false, ...extra });

test('arms a new candidate/job attempt before dispatch; never submits from the gate', async () => {
  let arming = 0;
  const state = await armSpotApplicationDispatch(setup({ armPending: async () => { arming++; return false; } }));
  assert.equal(state, 'armed');
  assert.equal(arming, 1);
});

test('existing unresolved durable receipt prevents a second submission', async () => {
  assert.equal(await armSpotApplicationDispatch(setup({ armPending: async () => true })), 'unresolved');
});

test('a session lost before arming never touches durable storage', async () => {
  let attempts = 0;
  assert.equal(await armSpotApplicationDispatch(setup({
    isCurrent: () => false,
    armPending: async () => { attempts++; return false; },
  })), 'stale');
  assert.equal(attempts, 0);
});

test('a session lost while arming stays quarantined even when marker was just written', async () => {
  let finish;
  let current = true;
  const operation = armSpotApplicationDispatch(setup({
    isCurrent: () => current,
    armPending: () => new Promise(resolve => { finish = resolve; }),
  }));
  assert.equal(typeof finish, 'function');
  current = false;
  finish(false);
  assert.equal(await operation, 'stale');
});

test('a reused receipt is never converted into a fresh arm after session expiry', async () => {
  let current = true;
  assert.equal(await armSpotApplicationDispatch(setup({
    isCurrent: () => current,
    armPending: async () => { current = false; return true; },
  })), 'stale');
});

test('storage failure propagates; caller must not submit or clear the uncertain receipt', async () => {
  await assert.rejects(armSpotApplicationDispatch(setup({
    armPending: async () => { throw new Error('synthetic encrypted storage failure'); },
  })), /synthetic encrypted storage failure/);
});
