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

export type VerifiedFinanceMetric = {
  value: number | string | null;
  label: string;
  unit: string | null;
  source: 'hf_verified';
  sample_size: number;
};

export type VerifiedFinanceProfile = {
  facility_id: string;
  generated_at: string;
  period_start: string;
  period_end: string;
  methodology_version: string;
  verified_metrics: Record<string, VerifiedFinanceMetric>;
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
  verified_finance: VerifiedFinanceProfile | null;
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
  job_title: string;
  employment_type: string | null;
  facility_name: string;
  prefecture: string | null;
  city: string | null;
};

export type JobseekerInterview = {
  id: string;
  application_id: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_url: string | null;
  status: string;
  updated_at: string;
};

export type JobseekerVisit = {
  id: string;
  application_id: string | null;
  job_id: string;
  experience_type: 'visit' | 'half_day_trial' | 'full_day_trial';
  starts_at: string;
  ends_at: string;
  status: string;
  candidate_message: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type JobseekerApplicationDetail = {
  application: Application;
  interviews: JobseekerInterview[];
  visits: JobseekerVisit[];
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

  const rawJobs = (data || []) as Omit<Job, 'verified_workplace' | 'verified_finance'>[];
  const facilityIds = [...new Set(rawJobs.map((job) => job.facility_id).filter(Boolean))];
  if (!facilityIds.length) return rawJobs.map((job) => ({ ...job, verified_workplace: null, verified_finance: null }));

  const [workplaceResult, financeResult] = await Promise.all([
    client().from('hc_public_workplace_profiles')
      .select('facility_id,generated_at,period_start,period_end,methodology_version,verified_metrics,verified_metric_count,quality_points,transparency_pct,updated_at')
      .in('facility_id', facilityIds),
    client().from('hc_public_finance_profiles')
      .select('facility_id,generated_at,period_start,period_end,methodology_version,verified_metrics,verified_metric_count,quality_points,transparency_pct,updated_at')
      .in('facility_id', facilityIds),
  ]);
  if (workplaceResult.error) throw workplaceResult.error;
  if (financeResult.error) throw financeResult.error;

  const workplaceProfiles = new Map(
    ((workplaceResult.data || []) as VerifiedWorkplaceProfile[]).map((profile) => [profile.facility_id, profile]),
  );
  const financeProfiles = new Map(
    ((financeResult.data || []) as VerifiedFinanceProfile[]).map((profile) => [profile.facility_id, profile]),
  );

  return rawJobs
    .map((job) => ({
      ...job,
      verified_workplace: workplaceProfiles.get(job.facility_id) || null,
      verified_finance: financeProfiles.get(job.facility_id) || null,
    }))
    .sort((a, b) => {
      const qualityA = Number(a.verified_workplace?.quality_points || 0) + Number(a.verified_finance?.quality_points || 0);
      const qualityB = Number(b.verified_workplace?.quality_points || 0) + Number(b.verified_finance?.quality_points || 0);
      const qualityDiff = qualityB - qualityA;
      if (qualityDiff !== 0) return qualityDiff;
      const transparencyA = Number(a.verified_workplace?.transparency_pct || 0) + Number(a.verified_finance?.transparency_pct || 0);
      const transparencyB = Number(b.verified_workplace?.transparency_pct || 0) + Number(b.verified_finance?.transparency_pct || 0);
      const transparencyDiff = transparencyB - transparencyA;
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
  const { data, error } = await client().rpc('hc_jobseeker_list_applications');
  if (error) throw error;
  return (data || []) as Application[];
}

export async function getJobseekerApplicationDetail(applicationId: string): Promise<JobseekerApplicationDetail | null> {
  const { data, error } = await client().rpc('hc_jobseeker_get_application_detail', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  if (!data) return null;
  const detail = data as JobseekerApplicationDetail;
  return {
    application: detail.application,
    interviews: Array.isArray(detail.interviews) ? detail.interviews : [],
    visits: Array.isArray(detail.visits) ? detail.visits : [],
  };
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
    p_desired_start_date: profile.desired_start_date,
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
