import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VerifiedProfile = {
  facility_id?: string;
  verified_metric_count?: number;
  quality_points?: number;
  transparency_pct?: number;
  verified_metrics?: Record<string, unknown>;
};

export type JobseekerJob = {
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
  verified_workplace: VerifiedProfile | null;
  verified_finance: VerifiedProfile | null;
};

type SearchRpcRow = JobseekerJob & {
  rank_quality: number | string;
  rank_transparency: number | string;
  total_count: number | string;
  has_more: boolean;
};

export type JobSearchCursor = {
  quality: number | string;
  transparency: number | string;
  publishedAt: string | null;
  id: string;
};

export type JobSearchPage = {
  jobs: JobseekerJob[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: JobSearchCursor | null;
};

export type JobseekerProfileInput = {
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

export type JobseekerProfile = JobseekerProfileInput & {
  clerk_user_id: string;
};

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw new Error('求人IDを確認できませんでした。');
}

function profileFromResponse(value: unknown): JobseekerProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('プロフィールを確認できませんでした。');
  }
  const row = value as Record<string, unknown>;
  if (typeof row.clerk_user_id !== 'string' || !row.clerk_user_id.trim()) {
    throw new Error('プロフィールを確認できませんでした。');
  }
  const nullableText = (key: string): string | null => {
    const current = row[key];
    if (current === null || typeof current === 'string') return current as string | null;
    throw new Error('プロフィールを確認できませんでした。');
  };
  const stringArray = (key: string): string[] => {
    const current = row[key];
    if (!Array.isArray(current) || !current.every((item) => typeof item === 'string')) {
      throw new Error('プロフィールを確認できませんでした。');
    }
    return [...current] as string[];
  };
  const experience = row.years_of_experience;
  if (experience !== null && (typeof experience !== 'number' || !Number.isFinite(experience))) {
    throw new Error('プロフィールを確認できませんでした。');
  }
  return {
    clerk_user_id: row.clerk_user_id,
    email: nullableText('email'),
    name: nullableText('name'),
    name_kana: nullableText('name_kana'),
    phone: nullableText('phone'),
    prefecture: nullableText('prefecture'),
    desired_positions: stringArray('desired_positions'),
    desired_employment_types: stringArray('desired_employment_types'),
    qualifications: stringArray('qualifications'),
    years_of_experience: experience as number | null,
    desired_start_date: nullableText('desired_start_date'),
    self_intro: nullableText('self_intro'),
  };
}

export async function searchJobseekerJobs(
  client: SupabaseClient,
  options: { keyword?: string; limit?: number; cursor?: JobSearchCursor | null } = {},
): Promise<JobSearchPage> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const cursor = options.cursor ?? null;
  const { data, error } = await client.rpc('hc_jobseeker_search_jobs', {
    p_query: options.keyword?.trim() || null,
    p_prefecture: null,
    p_employment_type: null,
    p_ho_verified: false,
    p_hf_verified: false,
    p_limit: limit,
    p_after_quality: cursor?.quality ?? null,
    p_after_transparency: cursor?.transparency ?? null,
    p_after_published_at: cursor?.publishedAt ?? null,
    p_after_id: cursor?.id ?? null,
  });
  if (error) throw error;

  const rows = (Array.isArray(data) ? data : []) as SearchRpcRow[];
  const last = rows.at(-1) ?? null;
  const hasMore = Boolean(rows[0]?.has_more);
  const jobs = rows.map((row) => {
    const {
      rank_quality: _quality,
      rank_transparency: _transparency,
      total_count: _total,
      has_more: _hasMore,
      ...job
    } = row;
    return job;
  });
  return {
    jobs,
    totalCount: Number(rows[0]?.total_count ?? 0),
    hasMore,
    nextCursor:
      hasMore && last
        ? {
            quality: last.rank_quality,
            transparency: last.rank_transparency,
            publishedAt: last.published_at,
            id: last.id,
          }
        : null,
  };
}

export async function listSavedJobIds(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_saved_job_ids');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('保存した求人を確認できませんでした。');
  const ids: string[] = [];
  for (const row of data) {
    const id = (row as { job_id?: unknown } | null)?.job_id;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
      throw new Error('保存した求人を確認できませんでした。');
    }
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export async function listSavedJobs(client: SupabaseClient): Promise<JobseekerJob[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_saved_ranked_jobs');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('保存した求人を確認できませんでした。');
  return data as JobseekerJob[];
}

export async function saveJob(client: SupabaseClient, jobId: string): Promise<void> {
  assertUuid(jobId);
  const { data, error } = await client.rpc('hc_jobseeker_save_job', { p_job_id: jobId });
  if (error) throw error;
  const canonical = await listSavedJobIds(client);
  if (typeof data !== 'boolean' || !canonical.includes(jobId)) {
    throw new Error('求人の保存結果を確認できませんでした。再読込して確認してください。');
  }
}

export async function unsaveJob(client: SupabaseClient, jobId: string): Promise<void> {
  assertUuid(jobId);
  const { data, error } = await client.rpc('hc_jobseeker_unsave_job', { p_job_id: jobId });
  if (error) throw error;
  const canonical = await listSavedJobIds(client);
  if (typeof data !== 'boolean' || canonical.includes(jobId)) {
    throw new Error('求人の保存解除を確認できませんでした。再読込して確認してください。');
  }
}

export async function getJobseekerProfile(client: SupabaseClient): Promise<JobseekerProfile | null> {
  const { data, error } = await client.rpc('hc_jobseeker_get_profile');
  if (error) throw error;
  return data === null ? null : profileFromResponse(data);
}

export async function upsertJobseekerProfile(
  client: SupabaseClient,
  profile: JobseekerProfileInput,
): Promise<JobseekerProfile> {
  const { data, error } = await client.rpc('hc_jobseeker_upsert_profile', {
    p_email: profile.email,
    p_name: profile.name,
    p_name_kana: profile.name_kana,
    p_phone: profile.phone,
    p_prefecture: profile.prefecture,
    p_desired_positions: profile.desired_positions,
    p_desired_employment_types: profile.desired_employment_types,
    p_qualifications: profile.qualifications,
    p_years_of_experience: profile.years_of_experience,
    p_desired_start_date: profile.desired_start_date,
    p_self_intro: profile.self_intro,
  });
  if (error) throw error;
  return profileFromResponse(data);
}
