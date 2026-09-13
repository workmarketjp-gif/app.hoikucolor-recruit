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
  spot_break_minutes?: number | null;
  verified_workplace: VerifiedWorkplaceProfile | null;
  verified_finance: VerifiedFinanceProfile | null;
};

export type JobSearchCursor = {
  quality: number | string;
  transparency: number | string;
  publishedAt: string | null;
  id: string;
};

export type JobSearchFilters = {
  keyword?: string;
  prefecture?: string;
  employmentType?: string;
  hoVerifiedOnly?: boolean;
  hfVerifiedOnly?: boolean;
  limit?: number;
  cursor?: JobSearchCursor | null;
};

export type JobSearchPage = {
  jobs: Job[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: JobSearchCursor | null;
};

export type JobSearchFacets = {
  prefectures: string[];
  employmentTypes: string[];
};

type JobSearchRpcRow = Job & {
  rank_quality: number | string;
  rank_transparency: number | string;
  total_count: number | string;
  has_more: boolean;
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

export type JobseekerInterviewResponseStatus = 'accepted' | 'reschedule_requested';

export type JobseekerInterview = {
  id: string;
  application_id: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_url: string | null;
  status: string;
  updated_at: string;
  candidate_response_status: JobseekerInterviewResponseStatus | null;
  candidate_response_message: string | null;
  candidate_responded_at: string | null;
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

const JOB_CATALOG_CACHE_MS = 30_000;
const COMPARE_JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let jobCatalogCache: { expiresAt: number; key: string; promise: Promise<Job[]> } | null = null;

function comparisonRequestedJobIds(): string[] {
  if (typeof window === 'undefined' || !window.location.pathname.startsWith('/compare')) return [];
  const params = new URLSearchParams(window.location.search);
  return [...new Set(params.getAll('job_id').filter((id) => COMPARE_JOB_ID_PATTERN.test(id)))].slice(0, 3);
}

async function loadRankedJobs(exactJobIds: string[] = []): Promise<Job[]> {
  const { data, error } = await client().rpc('hc_jobseeker_list_ranked_jobs');
  if (error) throw error;

  const ranked = ((data || []) as Job[]).sort((a, b) => {
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

  if (!exactJobIds.length) return ranked;

  const byId = new Map(ranked.map((job) => [job.id, job]));
  const missingIds = exactJobIds.filter((jobId) => !byId.has(jobId));
  if (missingIds.length) {
    const exactJobs = await Promise.all(missingIds.map((jobId) => getRankedJob(jobId)));
    exactJobs.forEach((job) => {
      if (job) byId.set(job.id, job);
    });
  }

  const requestedJobs = exactJobIds.flatMap((jobId) => {
    const job = byId.get(jobId);
    return job ? [job] : [];
  });
  const requestedSet = new Set(requestedJobs.map((job) => job.id));
  return [...requestedJobs, ...ranked.filter((job) => !requestedSet.has(job.id))];
}

// Matching/comparison consume a bounded server-side shortlist. On /compare, valid job_id query
// parameters are additionally hydrated through the candidate-safe exact lookup so a shared
// comparison URL never drops a still-published job merely because it ranks outside the top 120.
export async function listJobs(): Promise<Job[]> {
  const now = Date.now();
  const requestedJobIds = comparisonRequestedJobIds();
  const cacheKey = requestedJobIds.length ? `compare:${requestedJobIds.join(',')}` : 'ranked-shortlist';
  if (jobCatalogCache && jobCatalogCache.expiresAt > now && jobCatalogCache.key === cacheKey) return jobCatalogCache.promise;

  const promise = loadRankedJobs(requestedJobIds).catch((error) => {
    if (jobCatalogCache?.promise === promise) jobCatalogCache = null;
    throw error;
  });
  jobCatalogCache = { expiresAt: now + JOB_CATALOG_CACHE_MS, key: cacheKey, promise };
  return promise;
}

export async function searchJobs(filters: JobSearchFilters = {}): Promise<JobSearchPage> {
  const cursor = filters.cursor || null;
  const limit = Math.max(1, Math.min(filters.limit || 24, 50));
  const { data, error } = await client().rpc('hc_jobseeker_search_jobs', {
    p_query: filters.keyword?.trim() || null,
    p_prefecture: filters.prefecture?.trim() || null,
    p_employment_type: filters.employmentType?.trim() || null,
    p_ho_verified: Boolean(filters.hoVerifiedOnly),
    p_hf_verified: Boolean(filters.hfVerifiedOnly),
    p_limit: limit,
    p_after_quality: cursor?.quality ?? null,
    p_after_transparency: cursor?.transparency ?? null,
    p_after_published_at: cursor?.publishedAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error) throw error;

  const rows = (data || []) as JobSearchRpcRow[];
  const last = rows.at(-1) || null;
  const hasMore = Boolean(rows[0]?.has_more);
  const jobs = rows.map(({ rank_quality: _rankQuality, rank_transparency: _rankTransparency, total_count: _totalCount, has_more: _hasMore, ...job }) => job);
  return {
    jobs,
    totalCount: Number(rows[0]?.total_count || 0),
    hasMore,
    nextCursor: hasMore && last ? {
      quality: last.rank_quality,
      transparency: last.rank_transparency,
      publishedAt: last.published_at,
      id: last.id,
    } : null,
  };
}

export async function listFeaturedJobs(limit = 3): Promise<JobSearchPage> {
  return searchJobs({ limit: Math.max(1, Math.min(limit, 12)) });
}

export async function getJobSearchFacets(): Promise<JobSearchFacets> {
  const { data, error } = await client().rpc('hc_jobseeker_job_search_facets');
  if (error) throw error;
  const row = (data || [])[0] as { prefectures?: string[] | null; employment_types?: string[] | null } | undefined;
  return {
    prefectures: row?.prefectures || [],
    employmentTypes: row?.employment_types || [],
  };
}

export async function listSavedRankedJobs(): Promise<Job[]> {
  const { data, error } = await client().rpc('hc_jobseeker_list_saved_ranked_jobs');
  if (error) throw error;
  return (data || []) as Job[];
}

export async function getRankedJob(jobId: string): Promise<Job | null> {
  const { data, error } = await client().rpc('hc_jobseeker_get_ranked_job', { p_job_id: jobId });
  if (error) throw error;
  const rows = (data || []) as Job[];
  return rows[0] || null;
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

export async function respondToInterview(
  interviewId: string,
  responseStatus: JobseekerInterviewResponseStatus,
  candidateMessage: string | null = null,
): Promise<void> {
  const { error } = await client().rpc('hc_jobseeker_respond_interview', {
    p_interview_id: interviewId,
    p_response_status: responseStatus,
    p_candidate_message: candidateMessage?.trim() || null,
  });
  if (error) throw error;
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
