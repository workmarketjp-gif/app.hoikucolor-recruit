import type { SupabaseClient } from '@supabase/supabase-js';

export type JobseekerScout = {
  scout_id: string;
  organization_name: string;
  facility_name: string;
  job_id: string | null;
  job_title: string | null;
  employment_type: string | null;
  invitation_message: string;
  scout_status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  sent_at: string;
  expires_at: string;
  responded_at: string | null;
};

export type ScoutBlockedOrganization = {
  organization_id: string;
  organization_name: string;
  source: 'manual' | 'current_employer';
};

export type ScoutPrivacySettings = {
  scout_opt_in: boolean;
  manual_blocks: ScoutBlockedOrganization[];
  automatic_blocks: ScoutBlockedOrganization[];
  identity_fields_shared_before_consent: boolean;
};

export type ScoutBlockableOrganization = {
  organization_id: string;
  organization_name: string;
};

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

export type SpotJobListing = {
  job_id: string;
  facility_id: string;
  facility_name: string;
  facility_type: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  title: string;
  description: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  hourly_rate: number;
  required_count: number;
  confirmed_count: number;
  available_count: number;
  required_qualification: string | null;
  age_group_or_class: string | null;
  facility_message: string | null;
  published_at: string | null;
  closing_at: string | null;
  application_id: string | null;
  application_status: string | null;
};

export type SpotAssignment = {
  assignment_id: string;
  application_id: string;
  job_id: string;
  facility_id: string;
  facility_name: string;
  facility_type: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  title: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  hourly_rate: number;
  assignment_status: string;
  confirmed_at: string;
};

function normalizeTime(value: unknown) {
  if (typeof value !== 'string' || !value) return null;
  return value.slice(0, 5);
}

function normalizePreferences(value: unknown): JobseekerMatchingPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...emptyJobseekerMatchingPreferences };
  const row = value as Partial<JobseekerMatchingPreferences>;
  return {
    desired_prefectures: Array.isArray(row.desired_prefectures) ? row.desired_prefectures : [],
    desired_cities: Array.isArray(row.desired_cities) ? row.desired_cities : [],
    desired_monthly_salary_min: typeof row.desired_monthly_salary_min === 'number' ? row.desired_monthly_salary_min : null,
    desired_hourly_wage_min: typeof row.desired_hourly_wage_min === 'number' ? row.desired_hourly_wage_min : null,
    available_weekdays: Array.isArray(row.available_weekdays) ? row.available_weekdays : [],
    available_time_from: normalizeTime(row.available_time_from),
    available_time_to: normalizeTime(row.available_time_to),
    max_commute_minutes: typeof row.max_commute_minutes === 'number' ? row.max_commute_minutes : null,
    classroom_experience: Array.isArray(row.classroom_experience) ? row.classroom_experience : [],
    leadership_roles: Array.isArray(row.leadership_roles) ? row.leadership_roles : [],
    preferred_child_ages: Array.isArray(row.preferred_child_ages) ? row.preferred_child_ages : [],
    childcare_values: Array.isArray(row.childcare_values) ? row.childcare_values : [],
    work_preferences: Array.isArray(row.work_preferences) ? row.work_preferences : [],
  };
}

export async function listJobseekerScouts(client: SupabaseClient): Promise<JobseekerScout[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_scouts');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as JobseekerScout[];
}

export async function respondToJobseekerScout(
  client: SupabaseClient,
  scoutId: string,
  decision: 'accepted' | 'declined',
): Promise<'accepted' | 'declined'> {
  const { data, error } = await client.rpc('hc_jobseeker_respond_scout', { p_scout_id: scoutId, p_decision: decision });
  if (error) throw error;
  if (data !== 'accepted' && data !== 'declined') throw new Error('スカウトの回答結果を確認できませんでした。');
  return data;
}

export async function getScoutPrivacySettings(client: SupabaseClient): Promise<ScoutPrivacySettings> {
  const { data, error } = await client.rpc('hc_jobseeker_get_scout_privacy');
  if (error) throw error;
  const row = (data ?? {}) as Partial<ScoutPrivacySettings>;
  return {
    scout_opt_in: row.scout_opt_in === true,
    manual_blocks: Array.isArray(row.manual_blocks) ? row.manual_blocks : [],
    automatic_blocks: Array.isArray(row.automatic_blocks) ? row.automatic_blocks : [],
    identity_fields_shared_before_consent: row.identity_fields_shared_before_consent === true,
  };
}

export async function setScoutOptIn(client: SupabaseClient, enabled: boolean): Promise<boolean> {
  const { data, error } = await client.rpc('hc_jobseeker_set_scout_opt_in', { p_enabled: enabled });
  if (error) throw error;
  return data === true;
}

export async function searchScoutBlockableOrganizations(client: SupabaseClient, query: string): Promise<ScoutBlockableOrganization[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const { data, error } = await client.rpc('hc_jobseeker_search_blockable_organizations', { p_query: normalized, p_limit: 10 });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ScoutBlockableOrganization[];
}

export async function addScoutBlockedOrganization(client: SupabaseClient, organizationId: string): Promise<void> {
  const { error } = await client.rpc('hc_jobseeker_add_blocked_organization', { p_organization_id: organizationId });
  if (error) throw error;
}

export async function removeScoutBlockedOrganization(client: SupabaseClient, organizationId: string): Promise<void> {
  const { error } = await client.rpc('hc_jobseeker_remove_blocked_organization', { p_organization_id: organizationId });
  if (error) throw error;
}

export async function getJobseekerMatchingPreferences(client: SupabaseClient): Promise<JobseekerMatchingPreferences> {
  const { data, error } = await client.rpc('hc_jobseeker_get_matching_preferences');
  if (error) throw error;
  return normalizePreferences(data);
}

export async function saveJobseekerMatchingPreferences(
  client: SupabaseClient,
  preferences: JobseekerMatchingPreferences,
): Promise<JobseekerMatchingPreferences> {
  const { data, error } = await client.rpc('hc_jobseeker_upsert_matching_preferences', {
    p_desired_prefectures: preferences.desired_prefectures,
    p_desired_cities: preferences.desired_cities,
    p_desired_monthly_salary_min: preferences.desired_monthly_salary_min,
    p_desired_hourly_wage_min: preferences.desired_hourly_wage_min,
    p_available_weekdays: preferences.available_weekdays,
    p_available_time_from: preferences.available_time_from,
    p_available_time_to: preferences.available_time_to,
    p_max_commute_minutes: preferences.max_commute_minutes,
    p_classroom_experience: preferences.classroom_experience,
    p_leadership_roles: preferences.leadership_roles,
    p_preferred_child_ages: preferences.preferred_child_ages,
    p_childcare_values: preferences.childcare_values,
    p_work_preferences: preferences.work_preferences,
  });
  if (error) throw error;
  return normalizePreferences(data);
}

export async function listSpotJobs(client: SupabaseClient): Promise<SpotJobListing[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_spot_jobs');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as SpotJobListing[];
}

export async function listMySpotAssignments(client: SupabaseClient): Promise<SpotAssignment[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_my_spot_assignments');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as SpotAssignment[];
}
