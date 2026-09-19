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
  const { data, error } = await client().rpc('hc_jobseeker_get_matching_preferences');
  if (error) throw error;
  return normalize(data as Partial<JobseekerMatchingPreferences> | null);
}

export async function saveJobseekerMatchingPreferences(preferences: JobseekerMatchingPreferences): Promise<void> {
  const { error } = await client().rpc('hc_jobseeker_upsert_matching_preferences', {
    p_desired_prefectures: preferences.desired_prefectures || [],
    p_desired_cities: preferences.desired_cities || [],
    p_desired_monthly_salary_min: preferences.desired_monthly_salary_min,
    p_desired_hourly_wage_min: preferences.desired_hourly_wage_min,
    p_available_weekdays: preferences.available_weekdays || [],
    p_available_time_from: preferences.available_time_from,
    p_available_time_to: preferences.available_time_to,
    p_max_commute_minutes: preferences.max_commute_minutes,
    p_classroom_experience: preferences.classroom_experience || [],
    p_leadership_roles: preferences.leadership_roles || [],
    p_preferred_child_ages: preferences.preferred_child_ages || [],
    p_childcare_values: preferences.childcare_values || [],
    p_work_preferences: preferences.work_preferences || [],
  });
  if (error) throw error;
}
