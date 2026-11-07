import assert from 'node:assert/strict';
import test from 'node:test';
import { readCanonicalSpotJobs, readCanonicalSpotAssignments } from '../src/lib/spotReadIntegrity.ts';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const common = { facility_id: B, facility_name: '合成保育園', title: '合成スポット勤務',
  work_date: '2026-11-10', start_time: '08:30:00', end_time: '17:00:00',
  break_minutes: 60, hourly_rate: 1400 };
const job = () => ({ ...common, job_id: A, required_count: 2, confirmed_count: 1,
  available_count: 1, application_id: null, application_status: null });
const assignment = () => ({ ...common, assignment_id: C, application_id: A, job_id: B,
  assignment_status: 'confirmed', confirmed_at: '2026-11-07T09:00:00+09:00' });

test('valid zero rows are the only canonical empty state', () => {
  assert.deepEqual(readCanonicalSpotJobs([]), []);
  assert.deepEqual(readCanonicalSpotAssignments([]), []);
});
test('valid spot listing and private assignment retain canonical values', () => {
  assert.deepEqual(readCanonicalSpotJobs([job()]), [job()]);
  assert.deepEqual(readCanonicalSpotAssignments([assignment()]), [assignment()]);
});
test('RPC null, objects, scalar and missing payloads never become no jobs/no history', () => {
  for (const payload of [null, undefined, {}, {data: []}, '[]', false, 0]) {
    assert.throws(() => readCanonicalSpotJobs(payload), /確認できません/);
    assert.throws(() => readCanonicalSpotAssignments(payload), /確認できません/);
  }
});
test('malformed or duplicate spot listing cannot be presented or applied', () => {
  for (const changed of [
    {job_id: ''}, {job_id: 'bad-id'}, {facility_id: 'bad-id'},
    {facility_name: ''}, {title: null}, {available_count: -1},
    {available_count: NaN}, {available_count: 99}, {required_count: 0},
    {confirmed_count: '1'}, {break_minutes: -1}, {hourly_rate: Infinity},
    {work_date: null}, {start_time: 'bad'}, {application_id: 'wrong'},
    {application_status: {}},
  ]) assert.throws(() => readCanonicalSpotJobs([{...job(), ...changed}]), /確認できません/);
  assert.throws(() => readCanonicalSpotJobs([job(), job()]), /確認できません/);
});
test('malformed or duplicate private assignments cannot be shown as a valid history', () => {
  for (const changed of [
    {assignment_id: null}, {application_id: 'bad'}, {job_id: null},
    {facility_id: 'bad'}, {assignment_status: ''}, {confirmed_at: null},
    {end_time: '30:00'}, {hourly_rate: Number.NaN},
  ]) assert.throws(() => readCanonicalSpotAssignments([{...assignment(), ...changed}]), /確認できません/);
  assert.throws(() => readCanonicalSpotAssignments([assignment(), assignment()]), /確認できません/);
});
test('invalid mixed result rejects the entire read; no partial success', () => {
  const otherJob = {...job(), job_id: C, available_count: -1};
  assert.throws(() => readCanonicalSpotJobs([job(), otherJob]), /確認できません/);
  const otherAssignment = {...assignment(), assignment_id: B, start_time: 'bad'};
  assert.throws(() => readCanonicalSpotAssignments([assignment(), otherAssignment]), /確認できません/);
});

test('spot application tap must be current, available, not already applied, and not concurrent', async () => {
  const { canStartSpotApplication } = await import('../src/lib/spotReadIntegrity.ts');
  const input = { jobId: A, visibleJobs: [job()], ownerKey: 'u1:s1',
    verifiedOwnerKey: 'u1:s1', privateAllowed: true, pending: false };
  assert.equal(canStartSpotApplication(input), true);
  for (const changes of [
    { jobId: B }, { visibleJobs: [] }, { visibleJobs: [{ ...job(), available_count: 0 }] },
    { visibleJobs: [{ ...job(), application_id: C }] }, { ownerKey: 'u2:s2' },
    { verifiedOwnerKey: null }, { privateAllowed: false }, { pending: true },
  ]) assert.equal(canStartSpotApplication({ ...input, ...changes }), false);
});
