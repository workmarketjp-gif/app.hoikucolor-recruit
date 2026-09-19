import type { SupabaseClient } from '@supabase/supabase-js';

export type AccountDeletionStatus = 'requested' | 'processing' | 'completed' | 'cancelled' | 'failed';

export type AccountDeletionRequest = {
  id: string;
  status: AccountDeletionStatus;
  requestedAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  processingStage: string | null;
};

const statuses = new Set<AccountDeletionStatus>(['requested', 'processing', 'completed', 'cancelled', 'failed']);

function parseRequest(data: unknown): AccountDeletionRequest | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (typeof value.id !== 'string' || typeof value.status !== 'string' || !statuses.has(value.status as AccountDeletionStatus)) return null;
  return {
    id: value.id,
    status: value.status as AccountDeletionStatus,
    requestedAt: String(value.requested_at ?? ''),
    updatedAt: String(value.updated_at ?? ''),
    completedAt: typeof value.completed_at === 'string' ? value.completed_at : null,
    cancelledAt: typeof value.cancelled_at === 'string' ? value.cancelled_at : null,
    processingStage: typeof value.processing_stage === 'string' ? value.processing_stage : null,
  };
}

export async function getAccountDeletionRequest(client: SupabaseClient) {
  const { data, error } = await client.rpc('hc_jobseeker_get_account_deletion_request_v1');
  if (error) throw error;
  return parseRequest(data);
}

export async function requestAccountDeletion(client: SupabaseClient) {
  const { data, error } = await client.rpc('hc_jobseeker_request_account_deletion_v1');
  if (error) throw error;
  const parsed = parseRequest(data);
  if (!parsed) throw new Error('ACCOUNT_DELETION_REQUEST_INVALID_RESPONSE');
  return parsed;
}

export async function cancelAccountDeletion(client: SupabaseClient) {
  const { data, error } = await client.rpc('hc_jobseeker_cancel_account_deletion_v1');
  if (error) throw error;
  const parsed = parseRequest(data);
  if (!parsed) throw new Error('ACCOUNT_DELETION_CANCEL_INVALID_RESPONSE');
  return parsed;
}
