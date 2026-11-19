import assert from 'node:assert/strict';
import test from 'node:test';
import { retainConfirmedSpotApplication } from '../src/lib/spotConfirmedApplication.ts';

const JOB = 'e2123456-1234-4234-8234-123456789abc';
const OTHER = 'a2123456-1234-4234-8234-123456789abc';
const APP = 'b2123456-1234-4234-8234-123456789abc';
const CONFLICT = 'c2123456-1234-4234-8234-123456789abc';
const row = { job_id: JOB, application_id: null, application_status: null, available_count: 1 };

test('candidate-confirmed detail locks the stale Spot card as applied before a list re-read', () => {
  const next = retainConfirmedSpotApplication([row], JOB, APP);
  assert.equal(next[0].application_id, APP);
  assert.equal(next[0].application_status, 'new');
  assert.equal(row.application_id, null);
});
test('unrelated cards retain their original state and identity', () => {
  const other = { ...row, job_id: OTHER };
  const next = retainConfirmedSpotApplication([row, other], JOB, APP);
  assert.equal(next[1], other);
});
test('same confirmed application keeps its later canonical status', () => {
  const next = retainConfirmedSpotApplication([{ ...row, application_id: APP, application_status: 'reviewing' }], JOB, APP);
  assert.equal(next[0].application_status, 'reviewing');
});
test('old status without an attached ID is not copied to a fresh confirmed application', () => {
  const next = retainConfirmedSpotApplication([{ ...row, application_status: 'withdrawn' }], JOB, APP);
  assert.equal(next[0].application_status, 'new');
});
test('contradictory existing application IDs are preserved, not overwritten', () => {
  const conflict = { ...row, application_id: CONFLICT, application_status: 'reviewing' };
  const next = retainConfirmedSpotApplication([conflict], JOB, APP);
  assert.equal(next[0], conflict);
});
test('invalid confirmed IDs fail closed', () => {
  assert.throws(() => retainConfirmedSpotApplication([row], JOB, 'bad-id'), /確認できません/);
  assert.throws(() => retainConfirmedSpotApplication([row], 'bad-id', APP), /確認できません/);
});
test('removed job does not get fabricated or inserted into the list', () => {
  assert.deepEqual(retainConfirmedSpotApplication([], JOB, APP), []);
});
