import assert from 'node:assert/strict';
import test from 'node:test';
import { mayBeginScoutManualRefresh } from '../src/lib/scoutManualRefreshGate.ts';

const idle = Object.freeze({
  privateAllowed: true,
  loading: false,
  busy: false,
  writePending: false,
  searchPending: false,
  refreshPending: false,
});

test('an authorized, idle candidate may explicitly refresh', () => {
  assert.equal(mayBeginScoutManualRefresh(idle), true);
});

for (const [field, value, label] of [
  ['privateAllowed', false, 'locked or signed out'],
  ['loading', true, 'initial load'],
  ['busy', true, 'busy operation'],
  ['writePending', true, 'in-flight write acknowledgement'],
  ['searchPending', true, 'in-flight organization search'],
  ['refreshPending', true, 'prior canonical refresh'],
]) {
  test(`${label} cannot start a competing Scout reload`, () => {
    assert.equal(mayBeginScoutManualRefresh({ ...idle, [field]: value }), false);
  });
}

test('a blocked refresh never mutates the caller state', () => {
  const state = Object.freeze({ ...idle, writePending: true });
  assert.equal(mayBeginScoutManualRefresh(state), false);
  assert.deepEqual(state, { ...idle, writePending: true });
});
