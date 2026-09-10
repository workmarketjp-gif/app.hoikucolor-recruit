import { supabase } from './supabase';

export type VerifiedWorkplaceMetric = {
  value: number | string | null;
  label: string;
  unit: string | null;
  source: 'ho_verified';
  sample_size: number;
};

export type VerifiedWorkplaceProfile = {
  facility_id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  methodology_version: string;
  verified_metrics: Record<string, VerifiedWorkplaceMetric>;
  verified_metric_count: number;
  quality_points: number;
  transparency_pct: number;
  updated_at: string;
};

export type Job = {
  id: string;
  facility_id: string;
  facility_name: string;
  facility_type: string | null;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  title: string;
  description: string;
  employment_type: string | null;
  salary_type: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_note: string | null;
  working_hours: string | null;
  holidays: string | null;
  required_qualification: string | null;
  benefits: string | null;
  number_of_positions: number;
  published_at: string | null;
  closing_at: string | null;
  verified_workplace: VerifiedWorkplaceProfile | null;
};

export type Application = {
  id: string;
  job_id: string;
  applicant_name: string;
  status: string;
  desired_start_date: string | null;
  message: string | null;
  applied_at: string;
  updated_at: string;
};

export type JobseekerProfile = {
  clerk_user_id: string;
  email: string | null;
  name: string | null;
  name_kana: string | null;
  phone: string | null;
  prefecture: string | null;
  desired_positions: string[];
  desired_employment_types: string[];
  qualifications: string[];
  years_of_experience: number | null;
  desired_start_date: string | null;
  self_intro: string | null;
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。Vercelの環境変数を確認してください。');
  return supabase;
}

function publishedAtEpoch(value: string | null) {
  if (!value) return 0;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? epoch : 0;
}

export async function listJobs(): Promise<Job[]> {
  const { data, error } = await client()
    .from('hc_jobseeker_job_feed')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false });
  if (error) throw error;

  const rawJobs = (data || []) as Omit<Job, 'verified_workplace'>[];
  const facilityIds = [...new Set(rawJobs.map((job) => job.facility_id).filter(Boolean))];
  if (!facilityIds.length) return rawJobs.map((job) => ({ ...job, verified_workplace: null }));

  const profileResult = await client()
    .from('hc_public_workplace_profiles')
    .select('facility_id,generated_at,period_start,period_end,methodology_version,verified_metrics,verified_metric_count,quality_points,transparency_pct,updated_at')
    .in('facility_id', facilityIds);
  if (profileResult.error) throw profileResult.error;

  const profiles = new Map(
    ((profileResult.data || []) as VerifiedWorkplaceProfile[]).map((profile) => [profile.facility_id, profile]),
  );

  return rawJobs
    .map((job) => ({ ...job, verified_workplace: profiles.get(job.facility_id) || null }))
    .sort((a, b) => {
      const qualityDiff = Number(b.verified_workplace?.quality_points || 0) - Number(a.verified_workplace?.quality_points || 0);
      if (qualityDiff !== 0) return qualityDiff;
      const transparencyDiff = Number(b.verified_workplace?.transparency_pct || 0) - Number(a.verified_workplace?.transparency_pct || 0);
      if (transparencyDiff !== 0) return transparencyDiff;
      return publishedAtEpoch(b.published_at) - publishedAtEpoch(a.published_at);
    });
}

export async function listSavedJobIds(): Promise<string[]> {
  const { data, error } = await client().from('hc_saved_jobs').select('job_id').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => row.job_id as string);
}

export async function saveJob(jobId: string, clerkUserId: string) {
  const { error } = await client().from('hc_saved_jobs').insert({ job_id: jobId, clerk_user_id: clerkUserId });
  if (error && error.code !== '23505') throw error;
}

export async function unsaveJob(jobId: string) {
  const { error } = await client().from('hc_saved_jobs').delete().eq('job_id', jobId);
  if (error) throw error;
}

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await client()
    .from('hc_applications')
    .select('id,job_id,applicant_name,status,desired_start_date,message,applied_at,updated_at')
    .order('applied_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Application[];
}

export async function submitApplication(jobId: string, profile: JobseekerProfile): Promise<string> {
  const applicantName = profile.name?.trim() || '';
  if (!applicantName) throw new Error('応募前にプロフィールのお名前を登録してください。');

  const { data, error } = await client().rpc('hc_jobseeker_submit_application', {
    p_job_id: jobId,
    p_applicant_name: applicantName,
    p_applicant_name_kana: profile.name_kana?.trim() || null,
    p_email: profile.email?.trim() || null,
    p_phone: profile.phone?.trim() || null,
    p_qualifications: profile.qualifications?.length ? profile.qualifications.join('、') : null,
    p_years_of_experience: profile.years_of_experience,
    p_desired_start_date: profile.desired_start_date || null,
    p_message: profile.self_intro?.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('応募IDを取得できませんでした。');
  return data;
}

export async function getProfile(): Promise<JobseekerProfile | null> {
  const { data, error } = await client()
    .from('hc_jobseeker_profiles')
    .select('clerk_user_id,email,name,name_kana,phone,prefecture,desired_positions,desired_employment_types,qualifications,years_of_experience,desired_start_date,self_intro')
    .maybeSingle();
  if (error) throw error;
  return data as JobseekerProfile | null;
}

export async function upsertProfile(profile: JobseekerProfile): Promise<void> {
  const { error } = await client().from('hc_jobseeker_profiles').upsert({
    ...profile,
    desired_positions: profile.desired_positions || [],
    desired_employment_types: profile.desired_employment_types || [],
    qualifications: profile.qualifications || [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'clerk_user_id' });
  if (error) throw error;
}
