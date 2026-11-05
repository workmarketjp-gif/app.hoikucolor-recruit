import type { JobseekerMatchingPreferences } from './candidateParityApi';

const arrayFields = [
  'desired_prefectures', 'desired_cities', 'available_weekdays',
  'classroom_experience', 'leadership_roles', 'preferred_child_ages',
  'childcare_values', 'work_preferences',
] as const;
const scalarFields = [
  'desired_monthly_salary_min', 'desired_hourly_wage_min',
  'available_time_from', 'available_time_to', 'max_commute_minutes',
] as const;

/** Compare the verified server snapshot, not the mutation RPC acknowledgement. */
export function canonicalScoutPreferencesMatch(
  requested: JobseekerMatchingPreferences,
  actual: JobseekerMatchingPreferences,
): boolean {
  if (!requested || !actual) return false;
  for (const field of scalarFields) {
    if (requested[field] !== actual[field]) return false;
  }
  for (const field of arrayFields) {
    const asked = requested[field];
    const saved = actual[field];
    if (!Array.isArray(asked) || !Array.isArray(saved) || asked.length !== saved.length) return false;
    if (new Set(asked).size !== asked.length || new Set(saved).size !== saved.length) return false;
    if (!asked.every((value) => saved.includes(value))) return false;
  }
  return true;
}

export function confirmScoutPreferences<T extends JobseekerMatchingPreferences>(
  requested: JobseekerMatchingPreferences,
  reread: T,
): T {
  if (!canonicalScoutPreferencesMatch(requested, reread)) {
    throw new Error('希望条件の保存結果を確認できませんでした。再読み込みしてご確認ください。');
  }
  return reread;
}
