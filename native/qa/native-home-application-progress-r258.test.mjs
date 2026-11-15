import test from 'node:test';
import assert from 'node:assert/strict';
import { homeInProgressApplicationCount } from '../src/lib/homeApplicationProgressCount.ts';

test('Web terminal statuses are excluded from the current-selection count', () => {
  const rows = ['new', 'in_review', 'interview_scheduled', 'offer', 'rejected', 'withdrawn', 'hired']
    .map((status) => ({ status }));
  assert.equal(homeInProgressApplicationCount(rows), 4);
});

test('confirmed empty canonical applications is zero, not a made-up selection', () => {
  assert.equal(homeInProgressApplicationCount([]), 0);
  assert.equal(homeInProgressApplicationCount([{ status: 'hired' }]), 0);
});

test('unrecognized future status is conservatively in-progress, matching the Web filter', () => {
  assert.equal(homeInProgressApplicationCount([{ status: 'future_status' }]), 1);
});

test('malformed or partial response cannot silently claim zero in progress', () => {
  for (const value of [null, undefined, {}, [null], [{}], [{ status: 0 }]]) {
    assert.throws(() => homeInProgressApplicationCount(value), /確認できません/);
  }
});
