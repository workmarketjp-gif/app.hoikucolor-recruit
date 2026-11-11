import assert from 'node:assert/strict';
import test from 'node:test';
import { verifiedScoutMatchingPreferences } from '../src/lib/scoutMatchingPreferencesCanonical.ts';

const valid = Object.freeze({
  desired_prefectures: ['東京都'], desired_cities: ['新宿区'],
  desired_monthly_salary_min: 250000, desired_hourly_wage_min: 1200,
  available_weekdays: ['月', '火'], available_time_from: '08:00:00',
  available_time_to: '17:00:00.000000', max_commute_minutes: 40,
  classroom_experience: ['0歳児'], leadership_roles: [],
  preferred_child_ages: ['0歳児'], childcare_values: ['子ども主体'],
  work_preferences: ['ICT活用'],
});
const parse = (value) => verifiedScoutMatchingPreferences(value);

test('complete synthetic RPC response is projected and PostgreSQL TIME becomes Web HH:mm', () => {
  const result = parse({...valid, should_not_leak: 'private'});
  assert.deepEqual(result, {...valid, available_time_from:'08:00', available_time_to:'17:00'});
  assert.equal(Object.hasOwn(result,'should_not_leak'),false);
});
test('null means a candidate who has not created a preference row; the result is not a shared singleton', () => {
  const a=parse(null), b=parse(null);
  assert.deepEqual(Object.keys(a).sort(), Object.keys(valid).sort());
  assert.deepEqual(a.desired_prefectures, []);
  assert.equal(a.max_commute_minutes,null);
  a.desired_prefectures.push('テスト');
  assert.deepEqual(b.desired_prefectures,[]);
});
test('undefined, array and primitives never masquerade as empty preferences', () => {
  for (const value of [undefined, [], 'null', false, 0]) assert.throws(()=>parse(value),/スカウト希望条件/);
});
test('missing/invalid list fields do not silently become empty', () => {
  for (const value of [undefined,null,{},[null],[123],[''],['東京都','東京都']]) {
    assert.throws(()=>parse({...valid,desired_prefectures:value}),/スカウト希望条件/);
  }
});
test('all list fields require validated array source', () => {
  for (const field of ['desired_cities','available_weekdays','classroom_experience','leadership_roles','preferred_child_ages','childcare_values','work_preferences']) {
    assert.throws(()=>parse({...valid,[field]:undefined}),/スカウト希望条件/, field);
  }
});
test('invalid number shapes and out-of-contract commute must be rejected', () => {
  for (const patch of [
    {desired_monthly_salary_min:undefined},{desired_monthly_salary_min:'300000'},
    {desired_hourly_wage_min:Infinity},{desired_hourly_wage_min:NaN},
    {desired_monthly_salary_min:-1},{desired_monthly_salary_min:1.5},
    {max_commute_minutes:0},{max_commute_minutes:301},
    {max_commute_minutes:Number.MAX_SAFE_INTEGER+1},
  ]) assert.throws(()=>parse({...valid,...patch}),/スカウト希望条件/);
});
test('null compensation and commute are valid opt-outs', () => {
  const result=parse({...valid,desired_monthly_salary_min:null,desired_hourly_wage_min:null,max_commute_minutes:null});
  assert.equal(result.desired_hourly_wage_min,null);
});
test('malformed time or reversed interval must not be presented as confirmed', () => {
  for (const patch of [
    {available_time_from:undefined},{available_time_from:''},
    {available_time_from:'25:00'},{available_time_to:'17:99:00'},
    {available_time_to:'07:00:00'}, {available_time_to:'08:00:00'},
    {available_time_to:'17:00:99'},
  ]) assert.throws(()=>parse({...valid,...patch}),/スカウト希望条件/);
});
test('a single optional bound and empty lists are valid', () => {
  const result=parse({...valid,desired_cities:[],available_time_from:null,available_time_to:'18:30'});
  assert.equal(result.available_time_from,null);
  assert.equal(result.available_time_to,'18:30');
});
test('server-origin list mutation cannot modify caller-owned response', () => {
  const source={...valid, desired_prefectures:['東京都']};
  const snapshot=parse(source);
  snapshot.desired_prefectures.push('大阪府');
  assert.deepEqual(source.desired_prefectures,['東京都']);
});
