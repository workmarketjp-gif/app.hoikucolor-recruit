import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifiedVisitSettingsReadback } from '../src/lib/visitSettingsReadback.ts';

const settings = {
  id: '11111111-1111-4111-8111-111111111111',
  facility_id: '22222222-2222-4222-8222-222222222222',
  visit_enabled: true,
  half_day_trial_enabled: false,
  full_day_trial_enabled: true,
  available_weekdays: [1, 3, 7],
  first_start_time: '09:00:00',
  last_start_time: '17:30:00',
  slot_interval_minutes: 30,
  visit_duration_minutes: 60,
  half_day_duration_minutes: 240,
  full_day_duration_minutes: 480,
  min_notice_hours: 24,
  max_days_ahead: 60,
  public_note: null,
  what_to_bring: '水筒',
  dress_code: null,
};
const invalid = (response) => assert.throws(() => verifiedVisitSettingsReadback(response), /受付設定を確認できませんでした/);

test('canonical RPC object and singleton-row response preserve the validated settings', () => {
  assert.deepEqual(verifiedVisitSettingsReadback(settings), settings);
  assert.deepEqual(verifiedVisitSettingsReadback([settings]), settings);
  assert.deepEqual(verifiedVisitSettingsReadback({ ...settings, first_start_time: '09:00', min_notice_hours: 0 }),
    { ...settings, first_start_time: '09:00', min_notice_hours: 0 });
});

test('no settings is distinct from malformed RPC success', () => {
  assert.equal(verifiedVisitSettingsReadback(null), null);
  assert.equal(verifiedVisitSettingsReadback([]), null);
  for (const data of [undefined, false, {}, [null], [{}, settings], [settings, settings], 'error', 0]) invalid(data);
});

test('foreign or missing facility identity is never silently accepted for booking presentation', () => {
  for (const patch of [{ id: null }, { facility_id: '' }, { facility_id: 'another' }, { visit_enabled: 'true' }]) {
    invalid({ ...settings, ...patch });
  }
});

test('invalid weekday and time controls are rejected instead of crashing a Native calendar', () => {
  for (const patch of [
    { available_weekdays: null }, { available_weekdays: [0] }, { available_weekdays: [8] },
    { available_weekdays: ['1'] }, { first_start_time: '26:00' }, { last_start_time: '07:30' },
    { first_start_time: undefined }, { last_start_time: '25:00' },
  ]) invalid({ ...settings, ...patch });
});

test('invalid numeric thresholds or arbitrary fields never enable booking', () => {
  for (const patch of [
    { slot_interval_minutes: '30' }, { slot_interval_minutes: Infinity },
    { min_notice_hours: -1 }, { max_days_ahead: NaN },
    { max_days_ahead: 30.5 }, { visit_duration_minutes: null },
    { full_day_duration_minutes: -2 }, { public_note: { html: 'text' } },
  ]) invalid({ ...settings, ...patch });
});

test('valid disabled venue settings remain displayable rather than treated as a failed read', () => {
  const closed = { ...settings, visit_enabled: false, full_day_trial_enabled: false,
    available_weekdays: [], min_notice_hours: 0, max_days_ahead: 0 };
  assert.deepEqual(verifiedVisitSettingsReadback(closed), closed);
});
