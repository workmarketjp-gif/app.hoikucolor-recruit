import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESUME_PROFILE_QUALIFICATION_OPTIONS, RESUME_PROFILE_QUALIFICATION_LIMIT,
  setResumeQualification, resumeOptionalProfileText,
} from '../src/lib/resumeLinkedProfilePolicy.ts';

test('qualifications match Web catalog, including ordinary driver licence', () => {
  assert.equal(RESUME_PROFILE_QUALIFICATION_OPTIONS.length, 10);
  assert.ok(RESUME_PROFILE_QUALIFICATION_OPTIONS.includes('普通自動車第一種運転免許'));
});
test('unknown previously saved qualifications remain when selecting a Web chip', () => {
  const changed = setResumeQualification(['海外資格'], {'海外資格': '2019-05'}, '保育士', true);
  assert.deepEqual(changed.qualifications, ['海外資格', '保育士']);
  assert.deepEqual(changed.acquisitionDates, {'海外資格':'2019-05'});
});
test('unselecting only the matching qualification prunes its date, never other dates', () => {
  const changed = setResumeQualification(['保育士','幼稚園教諭'], {'保育士': '2020-04', '幼稚園教諭': '2022-06'}, '保育士', false);
  assert.deepEqual(changed.qualifications, ['幼稚園教諭']);
  assert.deepEqual(changed.acquisitionDates, {'幼稚園教諭': '2022-06'});
});
test('toggle is idempotent and does not alter inputs', () => {
  const qualifications = ['保育士'];
  const dates = {'保育士':'2020-04'};
  const result = setResumeQualification(qualifications, dates, ' 保育士 ', true);
  assert.deepEqual(result.qualifications, qualifications);
  assert.deepEqual(result.acquisitionDates, dates);
  assert.deepEqual(qualifications, ['保育士']);
  assert.deepEqual(dates, {'保育士':'2020-04'});
});
test('50-qualification limit stops addition without deleting old dates', () => {
  const selected = Array.from({length:RESUME_PROFILE_QUALIFICATION_LIMIT}, (_, i)=>`資格${i}`);
  assert.throws(()=>setResumeQualification(selected, {'資格0':'2022-01'}, '新資格',true), /50件/);
  const result = setResumeQualification(selected, {'資格0':'2022-01'}, '資格0',false);
  assert.equal(result.qualifications.length, 49);
});
test('invalid qualification names are never accepted', () => {
  assert.throws(()=>setResumeQualification([],{}, ' ',true), /1〜100/);
  assert.throws(()=>setResumeQualification([],{}, 'a'.repeat(101),true), /1〜100/);
});
test('optional name and contact inputs follow Web null/empty semantics', () => {
  assert.equal(resumeOptionalProfileText(''),null);
  assert.equal(resumeOptionalProfileText('保育 花子'),'保育 花子');
  assert.equal(resumeOptionalProfileText('  '),'  ');
});
