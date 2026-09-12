import { supabase } from './supabase';

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

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。');
  return supabase;
}

export async function listJobseekerScouts(): Promise<JobseekerScout[]> {
  const { data, error } = await client().rpc('hc_jobseeker_list_scouts');
  if (error) throw error;
  return (data || []) as JobseekerScout[];
}

export async function respondToJobseekerScout(scoutId: string, decision: 'accepted' | 'declined'): Promise<'accepted' | 'declined'> {
  const { data, error } = await client().rpc('hc_jobseeker_respond_scout', {
    p_scout_id: scoutId,
    p_decision: decision,
  });
  if (error) throw error;
  if (data !== 'accepted' && data !== 'declined') throw new Error('スカウトの回答結果を確認できませんでした。');
  return data;
}
