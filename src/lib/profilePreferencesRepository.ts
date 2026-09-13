import { supabase } from './supabase';

export type JobseekerMatchingPreferences = {
  desired_prefectures: string[];
  desired_cities: string[];
  desired_monthly_salary_min: number | null;
  desired_hourly_wage_min: number | null;
  available_weekdays: string[];
  available_time_from: string | null;
  available_time_to: string | null;
  max_commute_minutes: number | null;
  classroom_experience: string[];
  leadership_roles: string[];
  preferred_child_ages: string[];
  childcare_values: string[];
  work_preferences: string[];
};

export const emptyJobseekerMatchingPreferences: JobseekerMatchingPreferences = {
  desired_prefectures: [],
  desired_cities: [],
  desired_monthly_salary_min: null,
  desired_hourly_wage_min: null,
  available_weekdays: [],
  available_time_from: null,
  available_time_to: null,
  max_commute_minutes: null,
  classroom_experience: [],
  leadership_roles: [],
  preferred_child_ages: [],
  childcare_values: [],
  work_preferences: [],
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。');
  return supabase;
}

const selectFields = [
  'desired_prefectures',
  'desired_cities',
  'desired_monthly_salary_min',
  'desired_hourly_wage_min',
  'available_weekdays',
  'available_time_from',
  'available_time_to',
  'max_commute_minutes',
  'classroom_experience',
  'leadership_roles',
  'preferred_child_ages',
  'childcare_values',
  'work_preferences',
].join(',');

function normalizeTime(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  return value.slice(0, 5);
}

function normalize(data: Partial<JobseekerMatchingPreferences> | null): JobseekerMatchingPreferences {
  if (!data) return { ...emptyJobseekerMatchingPreferences };
  return {
    desired_prefectures: Array.isArray(data.desired_prefectures) ? data.desired_prefectures : [],
    desired_cities: Array.isArray(data.desired_cities) ? data.desired_cities : [],
    desired_monthly_salary_min: typeof data.desired_monthly_salary_min === 'number' ? data.desired_monthly_salary_min : null,
    desired_hourly_wage_min: typeof data.desired_hourly_wage_min === 'number' ? data.desired_hourly_wage_min : null,
    available_weekdays: Array.isArray(data.available_weekdays) ? data.available_weekdays : [],
    available_time_from: normalizeTime(data.available_time_from),
    available_time_to: normalizeTime(data.available_time_to),
    max_commute_minutes: typeof data.max_commute_minutes === 'number' ? data.max_commute_minutes : null,
    classroom_experience: Array.isArray(data.classroom_experience) ? data.classroom_experience : [],
    leadership_roles: Array.isArray(data.leadership_roles) ? data.leadership_roles : [],
    preferred_child_ages: Array.isArray(data.preferred_child_ages) ? data.preferred_child_ages : [],
    childcare_values: Array.isArray(data.childcare_values) ? data.childcare_values : [],
    work_preferences: Array.isArray(data.work_preferences) ? data.work_preferences : [],
  };
}

export async function getJobseekerMatchingPreferences(): Promise<JobseekerMatchingPreferences> {
  const { data, error } = await client()
    .from('hc_jobseeker_profiles')
    .select(selectFields)
    .maybeSingle();
  if (error) throw error;
  return normalize(data as Partial<JobseekerMatchingPreferences> | null);
}

export async function saveJobseekerMatchingPreferences(clerkUserId: string, preferences: JobseekerMatchingPreferences): Promise<void> {
  const payload = {
    clerk_user_id: clerkUserId,
    ...preferences,
    desired_prefectures: preferences.desired_prefectures || [],
    desired_cities: preferences.desired_cities || [],
    available_weekdays: preferences.available_weekdays || [],
    classroom_experience: preferences.classroom_experience || [],
    leadership_roles: preferences.leadership_roles || [],
    preferred_child_ages: preferences.preferred_child_ages || [],
    childcare_values: preferences.childcare_values || [],
    work_preferences: preferences.work_preferences || [],
    updated_at: new Date().toISOString(),
  };
  const { error } = await client().from('hc_jobseeker_profiles').upsert(payload, { onConflict: 'clerk_user_id' });
  if (error) throw error;
}
