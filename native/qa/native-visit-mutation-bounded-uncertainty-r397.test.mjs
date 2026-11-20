import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitMutationTapGate } from '../src/lib/visitMutationTapGate.ts';
import { boundedVisitMutationPresentation, VisitMutationPresentationDeadlineError } from '../src/lib/visitMutationPresentationDeadline.ts';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

test('pending Clerk pin expires, remains quarantined, late token cannot launch RPC', async () => {
  const gate = createVisitMutationTapGate();
  const ticket = gate.begin();
  const token = deferred();
  let dispatched = 0;
  let quarantineCalls = 0;
  const execute = async () => {
    const pinned = await boundedVisitMutationPresentation(
      () => token.promise,
      () => { quarantineCalls++; gate.quarantine(ticket); }, 8,
    );
    if (gate.isCurrent(ticket) && pinned) dispatched++;
  };
  await assert.rejects(execute(), VisitMutationPresentationDeadlineError);
  assert.equal(quarantineCalls, 1);
  assert.equal(gate.isQuarantined(), true);
  assert.equal(gate.isCurrent(ticket), false);
  assert.equal(gate.begin(), null);
  token.resolve({ userId: 'synthetic-only' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dispatched, 0);
  assert.equal(gate.settle(ticket), false);
  assert.equal(gate.isPending(), true);
});

test('unknown RPC outcome cannot trigger late canonical read, next write or navigation', async () => {
  const gate = createVisitMutationTapGate();
  const ticket = gate.begin();
  const rpc = deferred();
  const steps = [];
  const operation = async () => {
    const result = await boundedVisitMutationPresentation(() => rpc.promise,
      () => gate.quarantine(ticket), 8);
    if (!gate.isCurrent(ticket)) return;
    steps.push(`readback:${result}`);
    steps.push('navigate');
  };
  await assert.rejects(operation(), VisitMutationPresentationDeadlineError);
  rpc.resolve('synthetic-receipt');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(steps, []);
  assert.equal(gate.begin(), null);
  gate.invalidate(); // blur / App Lock permits a fresh canonical-read screen
  assert.equal(gate.isQuarantined(), false);
  assert.equal(typeof gate.begin(), 'number');
});

test('late RPC rejection after deadline is observed without unhandled rejection', async () => {
  const gate = createVisitMutationTapGate();
  const ticket = gate.begin();
  const rpc = deferred();
  await assert.rejects(
    boundedVisitMutationPresentation(() => rpc.promise, () => gate.quarantine(ticket), 7),
    VisitMutationPresentationDeadlineError,
  );
  rpc.reject(new Error('opaque private server error'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gate.isPending(), true);
});

test('ordinary operation success releases lane; no quarantine callback occurs', async () => {
  const gate = createVisitMutationTapGate();
  const ticket = gate.begin();
  let expired = 0;
  const result = await boundedVisitMutationPresentation(async () => 'verified',
    () => { expired++; gate.quarantine(ticket); }, 50);
  assert.equal(result, 'verified');
  assert.equal(expired, 0);
  assert.equal(gate.isCurrent(ticket), true);
  assert.equal(gate.settle(ticket), true);
  assert.equal(gate.isPending(), false);
});

test('operation failure propagates without being mistaken for deadline', async () => {
  const gate = createVisitMutationTapGate();
  const ticket = gate.begin();
  const failure = new Error('opaque synthetic failure');
  await assert.rejects(boundedVisitMutationPresentation(() => Promise.reject(failure),
    () => gate.quarantine(ticket), 50), failure);
  assert.equal(gate.isCurrent(ticket), true);
  assert.equal(gate.settle(ticket), true);
});

test('old timeout cannot quarantine a newer owner or unlock an old ticket', async () => {
  const gate = createVisitMutationTapGate();
  const old = gate.begin();
  gate.invalidate();
  const current = gate.begin();
  assert.equal(gate.quarantine(old), false);
  assert.equal(gate.isCurrent(current), true);
  assert.equal(gate.settle(old, true), false);
  assert.equal(gate.isCurrent(current), true);
});

test('timeout after an earlier successful settle never quarantines new work', async () => {
  const gate = createVisitMutationTapGate();
  const first = gate.begin();
  gate.settle(first);
  const second = gate.begin();
  assert.equal(gate.quarantine(first), false);
  assert.equal(gate.isCurrent(second), true);
});
