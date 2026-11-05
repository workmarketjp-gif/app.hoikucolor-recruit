import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalScoutPreferencesMatch, confirmScoutPreferences } from '../src/lib/scoutPreferencesReadback.ts';

const base = Object.freeze({
  desired_prefectures: ['東京都', '神奈川県'], desired_cities: ['新宿区'],
  desired_monthly_salary_min: 250000, desired_hourly_wage_min: null,
  available_weekdays: ['月', '火'], available_time_from: '08:00', available_time_to: '17:00',
  max_commute_minutes: 40, classroom_experience: ['0歳児'], leadership_roles: [],
  preferred_child_ages: ['0歳児', '1歳児'], childcare_values: ['子ども主体'],
  work_preferences: ['ICT活用'],
});

test('identical verified preference snapshot may be acknowledged', () => {
  const reread = structuredClone(base);
  assert.equal(confirmScoutPreferences(base, reread), reread);
});
test('server may return set fields in a different order', () => {
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, desired_prefectures: ['神奈川県', '東京都'] }), true);
});
test('changed location is not acknowledged', () => {
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, desired_prefectures: ['東京都'] }), false);
});
test('server mismatch on salary or commute is not acknowledged', () => {
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, desired_monthly_salary_min: null }), false);
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, max_commute_minutes: 0 }), false);
});
test('changed available days or hours are not acknowledged', () => {
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, available_weekdays: ['火'] }), false);
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, available_time_to: '18:00' }), false);
});
test('classroom, childcare values and work preferences must match', () => {
  for (const field of ['classroom_experience', 'leadership_roles', 'preferred_child_ages', 'childcare_values', 'work_preferences']) {
    assert.equal(canonicalScoutPreferencesMatch(base, { ...base, [field]: ['変更された値'] }), false, field);
  }
});
test('duplicate, missing and corrupt array entries are not treated as canonical state', () => {
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, desired_prefectures: ['東京都', '東京都'] }), false);
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, desired_prefectures: null }), false);
  assert.equal(canonicalScoutPreferencesMatch(base, { ...base, desired_cities: ['新宿区', '新宿区'] }), false);
});
test('failed readback throws explicit retry guidance', () => {
  assert.throws(() => confirmScoutPreferences(base, { ...base, childcare_values: [] }), /再読み込み/);
});
test('empty profile fields must round-trip, including null and empty lists', () => {
  const empty = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Array.isArray(value) ? [] : null]));
  assert.equal(canonicalScoutPreferencesMatch(empty, structuredClone(empty)), true);
});
