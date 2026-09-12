import { supabase } from './supabase';

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

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。Vercelの環境変数を確認してください。');
  return supabase;
}

export async function listSpotJobs(): Promise<SpotJobListing[]> {
  const { data, error } = await client().rpc('hc_jobseeker_list_spot_jobs');
  if (error) throw error;
  return (data || []) as SpotJobListing[];
}
