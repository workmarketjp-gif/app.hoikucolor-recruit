import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationDecisionGate } from '../src/lib/applicationDecisionGate.ts';

// InterviewCard reuses the existing ref-backed decision lease. These focused
// tests exercise its tap/blur/session transition behavior, not rendered UI.
test('interview OK and reschedule cannot start in the same React frame', () => {
  const gate = createApplicationDecisionGate();
  const accepted = gate.begin();
  assert.ok(accepted);
  assert.equal(gate.begin(), null);
  assert.equal(gate.isCurrent(accepted), true);
  assert.equal(gate.finish(accepted), true);
});

test('leaving screen during asynchronous session pin blocks a late mutation', async () => {
  const gate = createApplicationDecisionGate();
  const started = gate.begin();
  let resolvePin;
  const pin = new Promise((resolve) => { resolvePin = resolve; });
  let networkMutations = 0;
  const actor = (async () => {
    const pinned = await pin;
    if (!pinned.isCurrent() || !gate.isCurrent(started)) return;
    networkMutations++;
  })();
  gate.revoke();
  assert.equal(gate.begin(), null, 'no duplicate RPC on immediate re-entry');
  resolvePin({ isCurrent: () => true });
  await actor;
  assert.equal(networkMutations, 0);
  assert.equal(gate.finish(started), false);
});

test('expired Clerk pin blocks interview RPC even with an active screen lease', () => {
  const gate = createApplicationDecisionGate();
  const token = gate.begin();
  let networkMutations = 0;
  const pinned = { isCurrent: () => false };
  if (pinned.isCurrent() && gate.isCurrent(token)) networkMutations++;
  assert.equal(networkMutations, 0);
  assert.equal(gate.finish(token), true);
});

test('old interview response cannot update resumed view after blur', () => {
  const gate = createApplicationDecisionGate();
  const oldToken = gate.begin();
  gate.revoke();
  assert.equal(gate.isCurrent(oldToken), false);
  assert.equal(gate.finish(oldToken), false);
  const freshToken = gate.begin();
  assert.notEqual(freshToken, null);
  assert.equal(gate.isCurrent(oldToken), false);
  assert.equal(gate.isCurrent(freshToken), true);
  assert.equal(gate.finish(freshToken), true);
});
