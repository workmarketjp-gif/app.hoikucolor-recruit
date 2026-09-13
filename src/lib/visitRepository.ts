import { supabase } from './supabase';

export type VisitExperienceType = 'visit' | 'half_day_trial' | 'full_day_trial';
export type VisitReservationStatus = 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'completed' | 'no_show';

export type VisitSettings = {
  id: string;
  facility_id: string;
  visit_enabled: boolean;
  half_day_trial_enabled: boolean;
  full_day_trial_enabled: boolean;
  available_weekdays: number[];
  first_start_time: string;
  last_start_time: string;
  slot_interval_minutes: number;
  visit_duration_minutes: number;
  half_day_duration_minutes: number;
  full_day_duration_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  public_note: string | null;
  what_to_bring: string | null;
  dress_code: string | null;
};

export type VisitReservation = {
  id: string;
  facility_id: string;
  job_id: string;
  application_id: string | null;
  experience_type: VisitExperienceType;
  starts_at: string;
  ends_at: string;
  status: VisitReservationStatus;
  candidate_message: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。Vercelの環境変数を確認してください。');
  return supabase;
}

export async function getVisitSettings(jobId: string): Promise<VisitSettings | null> {
  const { data, error } = await client().rpc('hc_jobseeker_get_visit_settings', {
    p_job_id: jobId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  return row as VisitSettings;
}

export async function listMyVisitReservations(jobId?: string): Promise<VisitReservation[]> {
  const { data, error } = await client().rpc('hc_list_my_visit_reservations', {
    p_job_id: jobId || null,
  });
  if (error) throw error;
  return (data || []) as VisitReservation[];
}

export async function requestVisit(params: {
  jobId: string;
  experienceType: VisitExperienceType;
  localDate: string;
  localTime: string;
  applicationId?: string | null;
  candidateMessage?: string | null;
}): Promise<string> {
  const { data, error } = await client().rpc('hc_request_visit', {
    p_job_id: params.jobId,
    p_experience_type: params.experienceType,
    p_local_date: params.localDate,
    p_local_time: params.localTime,
    p_application_id: params.applicationId || null,
    p_candidate_message: params.candidateMessage?.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('見学・体験予約IDを取得できませんでした。');
  return data;
}

export async function cancelVisit(reservationId: string): Promise<void> {
  const { data, error } = await client().rpc('hc_cancel_visit', { p_reservation_id: reservationId });
  if (error) throw error;
  if (data !== true) throw new Error('予約をキャンセルできませんでした。');
}
