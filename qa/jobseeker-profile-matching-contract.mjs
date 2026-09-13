import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260912030000_hc_jobseeker_profile_matching_preferences_v1.sql', 'utf8');
const repository = fs.readFileSync('src/lib/profilePreferencesRepository.ts', 'utf8');
const panel = fs.readFileSync('src/components/ProfileMatchingPreferencesPanel.tsx', 'utf8');
const vault = fs.readFileSync('src/components/DocumentVaultPanel.tsx', 'utf8');

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

for (const field of [
  'desired_prefectures', 'desired_cities', 'desired_monthly_salary_min', 'desired_hourly_wage_min',
  'available_weekdays', 'available_time_from', 'available_time_to', 'max_commute_minutes',
  'classroom_experience', 'leadership_roles', 'preferred_child_ages', 'childcare_values', 'work_preferences',
]) {
  expect(migration.includes(field), `migration missing ${field}`);
  expect(repository.includes(field), `repository missing ${field}`);
}

expect(migration.includes('hc_jobseeker_profiles_available_time_order'), 'DB must reject inverted availability time ranges');
expect(migration.includes('hc_jobseeker_profiles_commute_minutes_range'), 'DB must constrain commute minutes');
expect(migration.includes("revoke all on function hc_private.hc_jobseeker_anonymous_scout_snapshot(text, uuid) from public, anon, authenticated"), 'anonymous scout snapshot must remain private');

for (const pii of ["'name'", "'name_kana'", "'email'", "'phone'", "'clerk_user_id'", "'self_intro'"]) {
  expect(!migration.includes(`${pii}, p.`), `anonymous snapshot must not expose ${pii}`);
}

expect(panel.includes('大切にしたい保育観'), 'profile must collect structured childcare values');
expect(panel.includes('勤務できる曜日'), 'profile must collect availability');
expect(panel.includes('希望月給の下限'), 'profile must collect compensation preference');
expect(panel.includes('入力度'), 'profile must show preference completion');
expect(panel.includes('available_time_from >= draft.available_time_to'), 'client must reject inverted time range before save');
expect(vault.includes('<ProfileMatchingPreferencesPanel />'), 'profile preferences must be connected to the jobseeker profile screen');

console.log('jobseeker profile matching contract: OK');
