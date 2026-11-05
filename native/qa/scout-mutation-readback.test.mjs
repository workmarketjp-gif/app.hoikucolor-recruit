import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmScoutDecision, confirmScoutOptIn, confirmScoutBlock } from '../src/lib/scoutMutationReadback.ts';

const before = Object.freeze([{ scout_id: 'scout-a', scout_status: 'pending', responded_at: null }]);

test('accepted scout must be present in canonical list with accepted status', () => {
  const canonical = [{ ...before[0], scout_status: 'accepted', responded_at: '2026-11-01T00:00:00Z' }];
  assert.equal(confirmScoutDecision(canonical, 'scout-a', 'accepted'), canonical);
  assert.equal(canonical[0].responded_at, '2026-11-01T00:00:00Z');
});
test('declined scout must be present in canonical list with declined status', () => {
  const canonical = [{ ...before[0], scout_status: 'declined' }];
  assert.equal(confirmScoutDecision(canonical, 'scout-a', 'declined'), canonical);
});
test('an RPC acknowledgement with unchanged pending scout must not be treated as success', () => {
  assert.throws(() => confirmScoutDecision(before, 'scout-a', 'accepted'), /最新状態を確認/);
});
test('a revoked, deleted or foreign scout cannot be confirmed', () => {
  assert.throws(() => confirmScoutDecision([], 'scout-a', 'accepted'), /最新状態を確認/);
  assert.throws(() => confirmScoutDecision([{ scout_id: 'scout-b', scout_status: 'accepted' }], 'scout-a', 'accepted'), /最新状態を確認/);
});
test('ambiguous duplicate scout rows are rejected, not guessed', () => {
  const row = { scout_id: 'scout-a', scout_status: 'accepted' };
  assert.throws(() => confirmScoutDecision([row, row], 'scout-a', 'accepted'), /最新状態を確認/);
});
test('an accepted response may not masquerade as a declined readback', () => {
  assert.throws(() => confirmScoutDecision([{ scout_id: 'scout-a', scout_status: 'accepted' }], 'scout-a', 'declined'), /最新状態を確認/);
});
test('scout opt-in confirms only an exact canonical persisted value', () => {
  const enabled = { scout_opt_in: true, manual_blocks: [] };
  const disabled = { scout_opt_in: false, manual_blocks: [] };
  assert.equal(confirmScoutOptIn(enabled, true), enabled);
  assert.equal(confirmScoutOptIn(disabled, false), disabled);
  assert.throws(() => confirmScoutOptIn(disabled, true), /公開設定を確認/);
  assert.throws(() => confirmScoutOptIn(enabled, false), /公開設定を確認/);
});
test('manual block creation requires canonical organization entry', () => {
  const blocked = { scout_opt_in: true, manual_blocks: [{ organization_id: 'org-1' }] };
  assert.equal(confirmScoutBlock(blocked, 'org-1', true), blocked);
  assert.throws(() => confirmScoutBlock(blocked, 'org-2', true), /ブロック設定を確認/);
});
test('manual block removal requires server readback without that organization', () => {
  const unblocked = { scout_opt_in: true, manual_blocks: [] };
  assert.equal(confirmScoutBlock(unblocked, 'org-1', false), unblocked);
  assert.throws(() => confirmScoutBlock({ scout_opt_in: true, manual_blocks: [{ organization_id: 'org-1' }] }, 'org-1', false), /ブロック設定を確認/);
});
test('duplicate manual block records must not count as a verified single block', () => {
  const duplicate = { scout_opt_in: true, manual_blocks: [{ organization_id: 'org-1' }, { organization_id: 'org-1' }] };
  assert.throws(() => confirmScoutBlock(duplicate, 'org-1', true), /ブロック設定を確認/);
});
