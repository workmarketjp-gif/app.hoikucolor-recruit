import { supabase } from './supabase';
import { normalizeRequirements, type JobDocumentRequirements } from './documentTypes';

function db() {
  if (!supabase) throw new Error('Supabaseが設定されていません。');
  return supabase;
}

/**
 * The RPC is added by 20261017101147_hc_jobseeker_qualification_documents_v1.
 * Until that migration is applied, PostgREST answers "function not found";
 * no requirement can exist in that state, so it is the same as "not configured".
 */
export function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 'PGRST202' || code === '42883' || (typeof message === 'string' && /could not find the function/i.test(message));
}

export async function getJobDocumentRequirements(jobId: string): Promise<JobDocumentRequirements> {
  const { data, error } = await db().rpc('hc_jobseeker_get_job_document_requirements', { p_job_id: jobId });
  if (error) {
    if (isMissingRpcError(error)) return { configured: false, items: [] };
    throw error;
  }
  const items = normalizeRequirements(data);
  return { configured: items.length > 0, items };
}
