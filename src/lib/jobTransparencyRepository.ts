import { supabase } from './supabase';
import type { VerifiedWorkplaceProfile } from './recruitRepository';

export type FacilityTransparencyClaims = {
  break_time?: string;
  annual_holidays?: string;
  overtime?: string;
  take_home_work?: string;
  experience_requirement?: string;
};

export type PublishedRecruitmentFaq = {
  question: string;
  answer: string;
};

export type JobTransparency = {
  job_id: string;
  facility_claims: FacilityTransparencyClaims;
  published_faqs: PublishedRecruitmentFaq[];
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。Vercelの環境変数を確認してください。');
  return supabase;
}

export async function getJobTransparency(jobId: string): Promise<JobTransparency | null> {
  const { data, error } = await client().rpc('hc_jobseeker_get_job_transparency', {
    p_job_id: jobId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;

  const value = data as Partial<JobTransparency>;
  return {
    job_id: typeof value.job_id === 'string' ? value.job_id : jobId,
    facility_claims: value.facility_claims && typeof value.facility_claims === 'object'
      ? value.facility_claims
      : {},
    published_faqs: Array.isArray(value.published_faqs)
      ? value.published_faqs.filter((faq): faq is PublishedRecruitmentFaq => (
        Boolean(faq)
        && typeof faq.question === 'string'
        && typeof faq.answer === 'string'
      ))
      : [],
  };
}

export async function getPublicWorkplaceProfile(facilityId: string): Promise<VerifiedWorkplaceProfile | null> {
  const { data, error } = await client()
    .from('hc_public_workplace_profiles')
    .select('facility_id,generated_at,period_start,period_end,methodology_version,verified_metrics,verified_metric_count,quality_points,transparency_pct,updated_at')
    .eq('facility_id', facilityId)
    .maybeSingle();
  if (error) throw error;
  return data as VerifiedWorkplaceProfile | null;
}
