/**
 * Validate the candidate-private matching-preferences RPC snapshot before
 * presenting it as confirmed user settings. A missing profile is represented
 * by SQL null; malformed non-null RPC payloads must not become blank settings.
 * This is shape validation, not an authorization substitute for the RPC.
 */
const listFields = [
  'desired_prefectures', 'desired_cities', 'available_weekdays',
  'classroom_experience', 'leadership_roles', 'preferred_child_ages',
  'childcare_values', 'work_preferences',
] as const;
const numberFields = [
  'desired_monthly_salary_min', 'desired_hourly_wage_min', 'max_commute_minutes',
] as const;
const timeFields = ['available_time_from', 'available_time_to'] as const;

const invalid = () => new Error('スカウト希望条件を確認できませんでした。再読み込みしてください。');
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function canonicalTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value)) {
    throw invalid();
  }
  return value.slice(0, 5); // Postgres TIME often arrives as HH:mm:ss.
}

function emptySnapshot(): Record<string, unknown> {
  const empty: Record<string, unknown> = {};
  for (const field of listFields) empty[field] = [];
  for (const field of numberFields) empty[field] = null;
  for (const field of timeFields) empty[field] = null;
  return empty;
}

/** Preserve the verified field projection; do not spread unexpected RPC keys. */
export function verifiedScoutMatchingPreferences<T>(data: unknown): T {
  // The profile row does not exist yet for a newly registered candidate.
  // Null is the only valid absent-row shape; undefined, arrays and partial
  // objects are errors, never inferred user choices.
  if (data === null) return emptySnapshot() as T;
  if (!record(data)) throw invalid();

  const result: Record<string, unknown> = {};
  for (const field of listFields) {
    const values = data[field];
    if (!Array.isArray(values) ||
        !values.every((item) => typeof item === 'string' && item.trim().length > 0) ||
        new Set(values).size !== values.length) throw invalid();
    result[field] = [...values];
  }
  for (const field of numberFields) {
    const value = data[field];
    if (value !== null &&
        (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 ||
         (field === 'max_commute_minutes' && (value < 1 || value > 300)))) throw invalid();
    result[field] = value;
  }
  for (const field of timeFields) result[field] = canonicalTime(data[field]);
  if (result.available_time_from !== null && result.available_time_to !== null &&
      (result.available_time_from as string) >= (result.available_time_to as string)) throw invalid();
  return result as T;
}
