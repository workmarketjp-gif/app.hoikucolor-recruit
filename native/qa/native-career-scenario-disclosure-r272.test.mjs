import assert from 'node:assert/strict';
import test from 'node:test';
import { careerScenarioPresentation } from '../src/lib/careerScenarioPresentation.ts';

test('a missing salary input is never presented as zero matching jobs', () => {
  const m = careerScenarioPresentation({ready:false, missing:'salary_line'}, 'keep-income');
  assert.equal(m.unavailable?.title, '入力すると表示されます');
  assert.equal(m.unavailable?.description, '今の月給か、希望の最低月給を入力してください。');
  assert.equal(m.empty, null);
  assert.equal(m.unknownHolidays, null);
});

test('more-holidays requires current salary rather than desired salary', () => {
  const m = careerScenarioPresentation({ready:false, missing:'salary_line'}, 'more-holidays');
  assert.equal(m.unavailable?.description, '今の月給を入力してください。');
});

test('unverified holidays are disclosed but not inferred as zero holiday days', () => {
  const m = careerScenarioPresentation({ready:false, missing:'verified_holidays', unknown_holidays:13}, 'balance');
  assert.match(m.unavailable?.description ?? '', /確認できない求人 13件/);
  assert.equal(m.empty, null);
});

test('missing optional unknown count is not fabricated', () => {
  const m = careerScenarioPresentation({ready:false, missing:'verified_holidays'}, 'balance');
  assert.doesNotMatch(m.unavailable?.description ?? '', /件/);
});

test('a ready result with no items is a real empty state, not missing input', () => {
  const m = careerScenarioPresentation({ready:true, total:0, unknown_holidays:0, jobs:[]}, 'keep-income');
  assert.equal(m.unavailable, null);
  assert.equal(m.empty?.title, '条件に合う求人は見つかりませんでした');
  assert.equal(m.unknownHolidays, null);
});

test('canonical count and holiday uncertainty are carried without invented jobs', () => {
  const jobs = [{id:'synthetic-job-a'}];
  const m = careerScenarioPresentation({ready:true, total:5, unknown_holidays:8, jobs}, 'balance');
  assert.equal(m.unavailable, null);
  assert.equal(m.empty, null);
  assert.match(m.unknownHolidays ?? '', /8件/);
  assert.match(m.extraCount ?? '', /ほかに4件/);
  assert.equal(jobs.length, 1);
});

test('no phantom count when all returned jobs are present', () => {
  const m = careerScenarioPresentation({ready:true, total:1, unknown_holidays:0, jobs:[{id:'synthetic-job-a'}]}, 'keep-income');
  assert.equal(m.extraCount, null);
});
