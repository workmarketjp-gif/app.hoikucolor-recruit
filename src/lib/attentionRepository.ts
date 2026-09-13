import { supabase } from './supabase';

export type AttentionInterview = {
  application_id: string;
  interview_id: string;
  scheduled_at: string;
  facility_name: string;
  link_url: string;
};

export type AttentionMessage = {
  notification_id: string;
  application_id: string;
  created_at: string;
  facility_name: string;
  link_url: string;
};

export type AttentionScout = {
  scout_id: string;
  job_id: string | null;
  sent_at: string;
  expires_at: string;
  facility_name: string;
  link_url: string;
};

export type JobseekerAttentionSummary = {
  unanswered_interviews_count: number;
  unread_messages_count: number;
  pending_scouts_count: number;
  next_interview: AttentionInterview | null;
  next_message: AttentionMessage | null;
  next_scout: AttentionScout | null;
};

const emptySummary: JobseekerAttentionSummary = {
  unanswered_interviews_count: 0,
  unread_messages_count: 0,
  pending_scouts_count: 0,
  next_interview: null,
  next_message: null,
  next_scout: null,
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。');
  return supabase;
}

function count(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export async function getJobseekerAttentionSummary(): Promise<JobseekerAttentionSummary> {
  const { data, error } = await client().rpc('hc_jobseeker_attention_summary');
  if (error) throw error;
  if (!data || typeof data !== 'object') return emptySummary;
  const value = data as Partial<JobseekerAttentionSummary>;
  return {
    unanswered_interviews_count: count(value.unanswered_interviews_count),
    unread_messages_count: count(value.unread_messages_count),
    pending_scouts_count: count(value.pending_scouts_count),
    next_interview: value.next_interview || null,
    next_message: value.next_message || null,
    next_scout: value.next_scout || null,
  };
}

export async function markJobseekerApplicationMessagesRead(applicationId: string): Promise<number> {
  const { data, error } = await client().rpc('hc_jobseeker_mark_application_messages_read', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  const updated = Number(data || 0);
  return Number.isFinite(updated) && updated > 0 ? Math.floor(updated) : 0;
}
