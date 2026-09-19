import type { Job } from './recruitRepository';
import { hasSupabaseConfig, supabase } from './supabase';

export type SavedJobWithStatus = Job & { is_open: boolean };

function client() {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function listSavedJobsWithStatus(): Promise<SavedJobWithStatus[]> {
  const { data, error } = await client().rpc('hc_jobseeker_list_saved_jobs_with_status');
  if (error) throw error;
  return (data || []) as SavedJobWithStatus[];
}
