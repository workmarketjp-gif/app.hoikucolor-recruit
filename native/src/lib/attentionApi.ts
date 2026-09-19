import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export const emptyAttentionSummary: JobseekerAttentionSummary = {
  unanswered_interviews_count: 0,
  unread_messages_count: 0,
  pending_scouts_count: 0,
  next_interview: null,
  next_message: null,
  next_scout: null,
};

function count(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export async function getJobseekerAttentionSummary(client: SupabaseClient): Promise<JobseekerAttentionSummary> {
  const { data, error } = await client.rpc('hc_jobseeker_attention_summary');
  if (error) throw error;
  if (!data || typeof data !== 'object') return emptyAttentionSummary;
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

export function nativeAttentionInterviewHref(summary: JobseekerAttentionSummary): string {
  const applicationId = summary.next_interview?.application_id;
  const interviewId = summary.next_interview?.interview_id;
  if (!applicationId || !interviewId || !UUID_PATTERN.test(applicationId) || !UUID_PATTERN.test(interviewId)) {
    return '/(tabs)/applications';
  }
  return `/application/${applicationId}?focus=interview&interviewId=${interviewId}`;
}

export function nativeAttentionMessageHref(summary: JobseekerAttentionSummary): string {
  const applicationId = summary.next_message?.application_id;
  if (!applicationId || !UUID_PATTERN.test(applicationId)) return '/(tabs)/applications';
  return `/application/${applicationId}?focus=messages`;
}
