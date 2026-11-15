import test from 'node:test';
import assert from 'node:assert/strict';
import { pinForApplicationMutation } from '../src/lib/applicationMutationPin.ts';
import { beginCareerWrite, finishCareerWrite } from '../src/lib/careerWriteFlight.ts';
import { mayPresentCareerReadFailure } from '../src/lib/careerReadPreflight.ts';
import { careerMutationFailure } from '../src/lib/careerMutationRecovery.ts';

const ownerA = '["candidate-a","session-1"]';
const ownerB = '["candidate-b","session-2"]';
const pinned = (isCurrent = () => true) => ({ ownerId: 'candidate-a', ownerSessionId: 'session-1', isCurrent, client: { source: 'synthetic' } });
const delayed = () => new Promise(() => {});

async function careerWrite(pinAction, runWrite, state, timeoutMs = 15) {
  const launchGeneration = state.generation;
  const lease = beginCareerWrite(state.flight, ownerA, launchGeneration);
  if (!lease) return { duplicate: true };
  let writeStarted = false;
  try {
    const token = await pinForApplicationMutation(pinAction, () =>
      mayPresentCareerReadFailure(ownerA, state.owner, launchGeneration, state.generation, state.allowed) &&
      state.flight.current === lease, timeoutMs);
    if (token.ownerId !== 'candidate-a' || token.ownerSessionId !== 'session-1') throw new Error('Wrong synthetic owner');
    writeStarted = true;
    return { saved: await runWrite(token.client) };
  } catch {
    const notice = careerMutationFailure(writeStarted);
    return { notice: notice.notice, mustReload: notice.requiresCanonicalReload };
  } finally {
    finishCareerWrite(state.flight, lease);
  }
}

const state = () => ({ owner: ownerA, allowed: true, generation: 1, flight: { current: null } });

for (const op of ['salary', 'conditions', 'delete']) {
  test(`${op}: token acquisition timeout does not start the write and releases lease`, async () => {
    const s = state(); let writes = 0;
    const response = await careerWrite(delayed, () => { writes++; return 'unexpected'; }, s, 10);
    assert.equal(writes, 0);
    assert.equal(response.mustReload, false);
    assert.match(response.notice, /操作は開始していません/);
    assert.equal(s.flight.current, null);
  });
}

test('token that resolves after deadline never executes mutation', async () => {
  const s = state(); let release; let writes = 0;
  const response = await careerWrite(() => new Promise(resolve => { release = resolve; }), () => { writes++; }, s, 10);
  release(pinned());
  await Promise.resolve();
  assert.equal(writes, 0);
  assert.equal(response.mustReload, false);
});

test('current authorized token starts exactly one mutation', async () => {
  const s = state(); let writes = 0;
  const response = await careerWrite(async () => pinned(), async client => { writes++; return client.source; }, s, 20);
  assert.deepEqual(response, { saved: 'synthetic' });
  assert.equal(writes, 1);
  assert.equal(s.flight.current, null);
});

test('late App Lock blocks pending write even with a valid token', async () => {
  const s = state(); let resolve; let writes = 0;
  const pending = careerWrite(() => new Promise(r => { resolve = r; }), () => { writes++; }, s, 30);
  await Promise.resolve(); await Promise.resolve();
  s.allowed = false;
  resolve(pinned());
  const reply = await pending;
  assert.equal(writes, 0);
  assert.equal(reply.mustReload, false);
});

test('candidate switch blocks old token and does not unlock new candidate write flight', async () => {
  const s = state(); let release; let writes = 0;
  const pending = careerWrite(() => new Promise(r => { release = r; }), () => { writes++; }, s, 30);
  await Promise.resolve(); await Promise.resolve();
  s.owner = ownerB; s.generation++;
  const fresh = beginCareerWrite(s.flight, ownerB, s.generation);
  release(pinned());
  await pending;
  assert.equal(writes, 0);
  assert.equal(s.flight.current, fresh);
});

test('same-frame duplicate tap is refused while token preflight pending', async () => {
  const s = state(); let resolve; let writes = 0;
  const first = careerWrite(() => new Promise(r => { resolve = r; }), () => { writes++; return 'done'; }, s, 50);
  assert.deepEqual(await careerWrite(async () => pinned(), () => { writes++; }, s), { duplicate: true });
  await Promise.resolve(); await Promise.resolve();
  resolve(pinned());
  const result = await first;
  assert.deepEqual(result, { saved: 'done' });
  assert.equal(writes, 1);
});

test('once RPC starts, token deadline never times out or auto-retries ambiguous write', async () => {
  const s = state(); let finish; let writes = 0;
  const pending = careerWrite(async () => pinned(), () => { writes++; return new Promise(r => { finish = r; }); }, s, 10);
  await new Promise(r => setTimeout(r, 25));
  assert.equal(writes, 1);
  assert.ok(s.flight.current);
  finish('verified');
  assert.deepEqual(await pending, { saved: 'verified' });
  assert.equal(writes, 1);
});
