import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applicationVisitExperienceLabel,
  applicationVisitStatusLabel,
  canSubmitInterviewResponse,
  formatApplicationEventDateTimeJapan,
  interviewStatusLabel,
} from '../src/lib/applicationEventPresentation.ts';

test('interview state labels match Web and unknown states fail closed', () => {
  assert.equal(interviewStatusLabel('scheduled'), '予定');
  assert.equal(interviewStatusLabel('completed'), '完了');
  assert.equal(interviewStatusLabel('cancelled'), 'キャンセル');
  assert.equal(interviewStatusLabel('no_show'), '未実施');
  assert.equal(interviewStatusLabel('unexpected'), '状態を確認できません');
});

test('application detail visit labels match Web rather than raw database codes', () => {
  assert.deepEqual(['requested','confirmed','declined','cancelled','completed','no_show'].map(applicationVisitStatusLabel),
    ['確認中','確定','日程調整不可','キャンセル','参加済み','未参加']);
  assert.deepEqual(['visit','half_day_trial','full_day_trial'].map(applicationVisitExperienceLabel),
    ['園見学','半日体験','1日体験']);
  assert.equal(applicationVisitExperienceLabel('unknown'), '体験種別を確認できません');
});

test('interview scheduling uses Japan timezone with a fixed absolute instant', () => {
  const value = formatApplicationEventDateTimeJapan('2026-11-06T00:15:00Z');
  assert.match(value, /2026/);
  assert.match(value, /9:15|09:15/);
  assert.equal(formatApplicationEventDateTimeJapan('invalid'), '日時未設定');
  assert.equal(formatApplicationEventDateTimeJapan(null), '日時未設定');
});

test('interview response guards reject duplicate accepted action and closed interviews', () => {
  assert.equal(canSubmitInterviewResponse({status:'scheduled',candidate_response_status:null},'accepted',''), true);
  assert.equal(canSubmitInterviewResponse({status:'scheduled',candidate_response_status:'accepted'},'accepted',''), false);
  assert.equal(canSubmitInterviewResponse({status:'cancelled',candidate_response_status:null},'accepted',''), false);
  assert.equal(canSubmitInterviewResponse({status:'completed',candidate_response_status:null},'reschedule_requested','Saturday'), false);
});

test('reschedule requires a nonblank note while preserving Web ability to revise', () => {
  assert.equal(canSubmitInterviewResponse({status:'scheduled',candidate_response_status:null},'reschedule_requested',' \n '),false);
  assert.equal(canSubmitInterviewResponse({status:'scheduled',candidate_response_status:'accepted'},'reschedule_requested','平日18時以降'),true);
  assert.equal(canSubmitInterviewResponse({status:'scheduled',candidate_response_status:'reschedule_requested'},'reschedule_requested','土曜日午前'),true);
});
