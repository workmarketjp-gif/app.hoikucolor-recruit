import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCandidateApplicationDetailReadback } from '../src/lib/candidateApplicationDetailReadback.ts';

const app = '6411d4af-86f0-4791-b710-43fdcda51c25';
const anotherApp = '1411d4af-86f0-4791-b710-43fdcda51c25';
const job = '11c82317-5e1e-4b30-9cd5-0db3628f77e1';
const anotherJob = '21c82317-5e1e-4b30-9cd5-0db3628f77e1';
const interview = 'a220116a-5c31-42ad-aaf4-f6d44d68c999';
const visit = 'f220116a-5c31-42ad-aaf4-f6d44d68c999';
const application = {
  id: app, job_id: job, applicant_name: '保育 花子', status: 'reviewing',
  desired_start_date: '2027-04-01', message: 'よろしくお願いします',
  applied_at: '2026-11-07T01:10:00Z', updated_at: '2026-11-07T02:12:00Z',
  job_title: '保育士', employment_type: '正社員', facility_name: '合成さくら保育園',
  prefecture: '東京都', city: '文京区',
};
const firstInterview = {
  id: interview, application_id: app, scheduled_at: '2026-11-09T04:00:00Z',
  duration_minutes: 30, location: '園内', meeting_url: null,
  status: 'proposed', updated_at: '2026-11-07T02:12:00Z',
  candidate_response_status: null, candidate_response_message: null, candidate_responded_at: null,
};
const firstVisit = {
  id: visit, application_id: app, job_id: job, experience_type: 'visit',
  starts_at: '2026-11-10T02:00:00Z', ends_at: '2026-11-10T03:00:00Z',
  status: 'requested', candidate_message: null, confirmed_at: null,
  cancelled_at: null, completed_at: null, updated_at: '2026-11-07T02:12:00Z',
};
const details = () => ({ application: { ...application }, interviews: [{ ...firstInterview }], visits: [{ ...firstVisit }] });
const verify = (candidate, id = app) => assertCandidateApplicationDetailReadback(candidate, id);
const rejects = (candidate, id = app) => assert.throws(() => verify(candidate, id), /整合性/);

test('genuine SQL NULL means inaccessible/not found, but undefined does not', () => {
  assert.doesNotThrow(() => verify(null));
  for (const result of [undefined, false, 0, [], {}, { application, interviews: [] }, { application, visits: [] }]) rejects(result);
});
test('valid synthetic application with zero interviews and visits stays intact', () => {
  const result = { application, interviews: [], visits: [] };
  assert.doesNotThrow(() => verify(result));
  assert.deepEqual(result.interviews, []);
});
test('full canonical interview/visit state preserves candidate response without copying or mutation', () => {
  const result = details();
  assert.doesNotThrow(() => verify(result));
  assert.equal(result.interviews[0].candidate_response_status, null);
  assert.equal(result.visits[0].status, 'requested');
  assert.equal(result.application.facility_name, '合成さくら保育園');
});
test('valid older interview response projection and an unlinked candidate visit are accepted', () => {
  const result = details();
  delete result.interviews[0].candidate_response_status;
  delete result.interviews[0].candidate_response_message;
  delete result.interviews[0].candidate_responded_at;
  result.visits[0].application_id = null;
  assert.doesNotThrow(() => verify(result));
});
test('cross-application nested interview and parent application cannot appear on the wrong route', () => {
  const r = details(); r.interviews[0].application_id = anotherApp; rejects(r);
  const r2 = details(); r2.application.id = anotherApp; rejects(r2);
});
test('cross-job or cross-application visit must not be rendered in an owned application', () => {
  const r = details(); r.visits[0].job_id = anotherJob; rejects(r);
  const r2 = details(); r2.visits[0].application_id = anotherApp; rejects(r2);
});
test('missing or malformed interview/visit collections must not appear empty', () => {
  for (const field of ['interviews', 'visits']) {
    for (const value of [undefined, null, {}, '[]', [null]]) {
      const r = details(); r[field] = value; rejects(r);
    }
  }
});
test('invalid nested mandatory fields, duration, timestamps or response fail closed', () => {
  for (const patch of [
    { id: 'bad-id' }, { duration_minutes: 0 }, { scheduled_at: 'tomorrow' },
    { status: null }, { meeting_url: {} }, { candidate_response_status: 'approved' },
    { candidate_responded_at: 'bad-date' },
  ]) { const r = details(); Object.assign(r.interviews[0], patch); rejects(r); }
  for (const patch of [
    { experience_type: 'unexpected' }, { ends_at: '2026-11-09T02:00:00Z' },
    { confirmed_at: false }, { updated_at: 'yesterday' }, { candidate_message: {} },
  ]) { const r = details(); Object.assign(r.visits[0], patch); rejects(r); }
});
test('duplicate nested interview/visit UUIDs fail closed even if casing differs', () => {
  const r = details(); r.interviews.push({ ...firstInterview, id: interview.toUpperCase() }); rejects(r);
  const r2 = details(); r2.visits.push({ ...firstVisit, id: visit.toUpperCase() }); rejects(r2);
});
test('malformed application identity, timestamp and offer state cannot pass nested detail', () => {
  for (const patch of [{ job_id: 'bad' }, { updated_at: 'bad' }, { candidate_offer_response: 'confirmed' }]) {
    const r = details(); Object.assign(r.application, patch); rejects(r);
  }
});
