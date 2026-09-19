import { supabase } from './supabase';

export type CandidateOfferResponse = 'accepted' | 'declined' | null;

export type CandidateDecisionApplication = {
  id: string;
  status: string;
  candidate_offer_response: CandidateOfferResponse;
  candidate_offer_responded_at: string | null;
  candidate_offer_message: string | null;
};

export type CandidateWithdrawResult = {
  application_id: string;
  status: string;
  previous_status: string;
  action_type: string;
  cancelled_interviews: number;
  cancelled_visits: number;
};

export type CandidateAcceptOfferResult = {
  application_id: string;
  status: string;
  offer_response: 'accepted';
  offer_responded_at: string | null;
  message: string | null;
  already_accepted: boolean;
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。Cloudflareまたはローカルの環境変数を確認してください。');
  return supabase;
}

function assertApplicationId(applicationId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
    throw new Error('応募IDを確認できませんでした。');
  }
}

export async function getCandidateDecisionApplication(applicationId: string): Promise<CandidateDecisionApplication | null> {
  assertApplicationId(applicationId);
  const { data, error } = await client().rpc('hc_jobseeker_get_application_detail', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const application = (data as { application?: unknown }).application;
  if (!application || typeof application !== 'object' || Array.isArray(application)) return null;
  const row = application as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.status !== 'string') return null;
  const response = row.candidate_offer_response;
  if (response !== null && response !== 'accepted' && response !== 'declined') {
    throw new Error('内定回答の状態を確認できませんでした。');
  }
  return {
    id: row.id,
    status: row.status,
    candidate_offer_response: response as CandidateOfferResponse,
    candidate_offer_responded_at: typeof row.candidate_offer_responded_at === 'string' ? row.candidate_offer_responded_at : null,
    candidate_offer_message: typeof row.candidate_offer_message === 'string' ? row.candidate_offer_message : null,
  };
}

export async function acceptCandidateOffer(applicationId: string, message: string | null = null): Promise<CandidateAcceptOfferResult> {
  assertApplicationId(applicationId);
  const trimmed = message?.trim() || null;
  if (trimmed && trimmed.length > 1000) throw new Error('連絡事項は1000文字以内で入力してください。');
  const { data, error } = await client().rpc('hc_jobseeker_accept_offer', {
    p_application_id: applicationId,
    p_message: trimmed,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('内定承諾の結果を確認できませんでした。');
  const result = data as Record<string, unknown>;
  if (result.application_id !== applicationId || result.offer_response !== 'accepted') {
    throw new Error('内定承諾の結果を確認できませんでした。再読込して確認してください。');
  }
  return result as unknown as CandidateAcceptOfferResult;
}

export async function withdrawCandidateApplication(applicationId: string, reason: string | null = null): Promise<CandidateWithdrawResult> {
  assertApplicationId(applicationId);
  const trimmed = reason?.trim() || null;
  if (trimmed && trimmed.length > 1000) throw new Error('理由は1000文字以内で入力してください。');
  const { data, error } = await client().rpc('hc_jobseeker_withdraw_application', {
    p_application_id: applicationId,
    p_reason: trimmed,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('辞退結果を確認できませんでした。');
  const result = data as Record<string, unknown>;
  if (result.application_id !== applicationId || result.status !== 'withdrawn') {
    throw new Error('辞退結果を確認できませんでした。再読込して確認してください。');
  }
  return result as unknown as CandidateWithdrawResult;
}
