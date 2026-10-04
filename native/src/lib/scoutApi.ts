import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOUT_STATUSES = new Set(['pending', 'accepted', 'declined', 'cancelled', 'expired']);

export type JobseekerScoutStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export type JobseekerScout = {
  scout_id: string;
  organization_name: string;
  facility_name: string;
  job_id: string | null;
  job_title: string | null;
  employment_type: string | null;
  invitation_message: string;
  scout_status: JobseekerScoutStatus;
  sent_at: string;
  expires_at: string;
  responded_at: string | null;
};

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error('スカウト情報を確認できませんでした。');
  return value;
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || typeof value === 'string') return value as string | null;
  throw new Error('スカウト情報を確認できませんでした。');
}

function parseScout(value: unknown): JobseekerScout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('スカウト情報を確認できませんでした。');
  }
  const row = value as Record<string, unknown>;
  const scoutId = text(row, 'scout_id');
  const jobId = nullableText(row, 'job_id');
  const status = text(row, 'scout_status');
  if (!UUID_PATTERN.test(scoutId) || (jobId !== null && !UUID_PATTERN.test(jobId)) || !SCOUT_STATUSES.has(status)) {
    throw new Error('スカウト情報を確認できませんでした。');
  }
  return {
    scout_id: scoutId,
    organization_name: text(row, 'organization_name'),
    facility_name: text(row, 'facility_name'),
    job_id: jobId,
    job_title: nullableText(row, 'job_title'),
    employment_type: nullableText(row, 'employment_type'),
    invitation_message: text(row, 'invitation_message'),
    scout_status: status as JobseekerScoutStatus,
    sent_at: text(row, 'sent_at'),
    expires_at: text(row, 'expires_at'),
    responded_at: nullableText(row, 'responded_at'),
  };
}

export async function listJobseekerScouts(client: SupabaseClient): Promise<JobseekerScout[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_scouts');
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('スカウト情報を確認できませんでした。');
  return data.map(parseScout);
}

export async function respondToJobseekerScout(
  client: SupabaseClient,
  scoutId: string,
  decision: 'accepted' | 'declined',
): Promise<'accepted' | 'declined'> {
  if (!UUID_PATTERN.test(scoutId)) throw new Error('スカウトIDを確認できませんでした。');
  const { data, error } = await client.rpc('hc_jobseeker_respond_scout', {
    p_scout_id: scoutId,
    p_decision: decision,
  });
  if (error) throw error;
  if (data !== decision) throw new Error('スカウトの回答結果を確認できませんでした。');
  return decision;
}