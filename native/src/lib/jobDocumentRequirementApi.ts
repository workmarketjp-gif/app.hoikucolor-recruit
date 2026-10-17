import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeRequirements, type JobDocumentRequirements } from './documentTypes';

/** Same rule as Web (src/lib/jobDocumentRequirementRepository.ts): a missing RPC means "not configured". */
export function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 'PGRST202' || code === '42883' || (typeof message === 'string' && /could not find the function/i.test(message));
}

export async function getJobDocumentRequirements(client: SupabaseClient, jobId: string): Promise<JobDocumentRequirements> {
  const { data, error } = await client.rpc('hc_jobseeker_get_job_document_requirements', { p_job_id: jobId });
  if (error) {
    if (isMissingRpcError(error)) return { configured: false, items: [] };
    throw error;
  }
  const items = normalizeRequirements(data);
  return { configured: items.length > 0, items };
}

/** Plain-Japanese reasons for the server-side submission guards (identical wording to Web). */
export function submissionDocumentError(error: unknown): Error | null {
  const message = error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
  if (message.includes('required documents missing')) {
    return new Error('この求人に必要な書類がそろっていません。書類を選ぶか、この画面でアップロードしてから応募してください。');
  }
  if (message.includes('one document per type')) return new Error('同じ種類の書類は1件だけ選べます。');
  if (message.includes('document not found') || message.includes('too many documents')) {
    return new Error('選んだ書類を確認できませんでした。書類の一覧を読み込み直してから、もう一度お試しください。');
  }
  return null;
}
