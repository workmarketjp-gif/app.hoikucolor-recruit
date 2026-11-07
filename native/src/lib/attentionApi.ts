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

/** SQL count(*) and the mark-read RPC return JSON numbers, including a valid 0.
 * Missing/invalid responses are *unknown*, not evidence of zero unread rows.
 */
function confirmedRpcCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}を確認できませんでした。再読み込みしてください。`);
  }
  return value;
}

export async function getJobseekerAttentionSummary(client: SupabaseClient): Promise<JobseekerAttentionSummary> {
  const { data, error } = await client.rpc('hc_jobseeker_attention_summary');
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('新着情報を確認できませんでした。再読み込みしてください。');
  }
  const value = data as Partial<JobseekerAttentionSummary>;
  return {
    unanswered_interviews_count: confirmedRpcCount(value.unanswered_interviews_count, '面接の未回答件数'),
    unread_messages_count: confirmedRpcCount(value.unread_messages_count, 'メッセージの未読件数'),
    pending_scouts_count: confirmedRpcCount(value.pending_scouts_count, 'スカウトの未回答件数'),
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

/**
 * Match Web's mark-on-open behavior without acknowledging messages hidden below
 * the fold. Call only after an authenticated canonical read and visibility gate.
 * Ownership and read transition are enforced by the existing server RPC.
 */
export async function markVisibleApplicationMessagesRead(
  client: SupabaseClient,
  applicationId: string,
): Promise<number> {
  if (!UUID_PATTERN.test(applicationId)) throw new Error('応募IDを確認できませんでした。');
  const { data, error } = await client.rpc('hc_jobseeker_mark_application_messages_read', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  return confirmedRpcCount(data, 'メッセージの既読更新結果');
}
