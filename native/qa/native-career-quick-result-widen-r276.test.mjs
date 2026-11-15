import assert from 'node:assert/strict';
import test from 'node:test';
import { careerQuickResultActions } from '../src/lib/careerQuickResultActions.ts';

const empty = {ready:true, total:0, unknown_holidays:0, jobs:[]};

test('regional salary zero-result state offers nationwide rerun rather than a dead end', () => {
  const view = careerQuickResultActions(empty, '東京都', 'salary');
  assert.equal(view.locationLabel, '東京都');
  assert.equal(view.showWiden, true);
  assert.equal(view.moreLabel, null);
});

test('holiday path with insufficient verified holidays offers widening only when regional', () => {
  const missing = {ready:false,missing:'verified_holidays',unknown_holidays:14};
  assert.equal(careerQuickResultActions(missing, '東京都', 'holidays').showWiden, true);
  assert.equal(careerQuickResultActions(missing, '', 'holidays').showWiden, false);
  assert.equal(careerQuickResultActions(missing, '東京都', 'salary').showWiden, false);
});

test('missing monthly salary is never mistaken for a zero-result location search', () => {
  const missing = {ready:false, missing:'salary_line'};
  assert.equal(careerQuickResultActions(missing, '大阪府', 'salary').showWiden, false);
  assert.equal(careerQuickResultActions(missing, '大阪府', 'salary').moreLabel, null);
});

test('nationwide empty results cannot offer a redundant nationwide action', () => {
  const view = careerQuickResultActions(empty, '', 'holidays');
  assert.equal(view.locationLabel, '全国');
  assert.equal(view.showWiden, false);
});

test('quick result preview limits visible canonical jobs to three, not the advanced simulator', () => {
  const jobs = Array.from({length:6},(_,i)=>({id:`synthetic-${i}`}));
  const view = careerQuickResultActions({ready:true,total:10,jobs},'神奈川県','salary');
  assert.equal(view.previewCount, 3);
  assert.equal(view.moreLabel, 'ほかの7件も求人を探すで見る');
  assert.equal(view.showWiden, false);
  assert.equal(jobs.length, 6);
});

test('no false hidden-job count when all jobs are visible', () => {
  const view = careerQuickResultActions({ready:true,total:2,jobs:[{id:'synthetic-a'},{id:'synthetic-b'}]},'北海道','holidays');
  assert.equal(view.previewCount, 2);
  assert.equal(view.moreLabel, '求人を探すで、さらに見る');
  assert.equal(view.showWiden, false);
});

test('trim whitespace in area before deciding regional search and nationwide action', () => {
  const view = careerQuickResultActions(empty,'   ','salary');
  assert.equal(view.showWiden,false);
  assert.equal(view.locationLabel,'全国');
});
