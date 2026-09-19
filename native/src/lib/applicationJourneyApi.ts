import type { SupabaseClient } from '@supabase/supabase-js';
import {
  attachJobseekerDocumentToApplication,
  listApplicationDocumentExpectations,
  listJobseekerDocuments,
  listSubmittedApplicationDocuments,
} from './documentVaultApi';
import {
  captureDurableMutationSessionLease,
  clearDurableMutation,
  prepareDurableMutation,
} from './durableMutation';
import type { JobseekerJob, JobseekerProfile } from './jobseekerCoreApi';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label = 'ID') {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label}を確認できませんでした。`);
}

function cleanOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

export type JobseekerApplicationSummary = {
  id: string;
  job_id: string;
  applicant_name: string;
  status: string;
  desired_start_date: string | null;
  message: string | null;
  applied_at: string;
  updated_at: string;
  job_title: string;
  employment_type: string | null;
  facility_name: string;
  prefecture: string | null;
  city: string | null;
};

export type JobseekerInterviewResponseStatus = 'accepted' | 'reschedule_requested';

export type JobseekerInterview = {
  id: string;
  application_id: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_url: string | null;
  status: string;
  updated_at: string;
  candidate_response_status: JobseekerInterviewResponseStatus | null;
  candidate_response_message: string | null;
  candidate_responded_at: string | null;
};

export type JobseekerApplicationVisit = {
  id: string;
  application_id: string | null;
  job_id: string;
  experience_type: 'visit' | 'half_day_trial' | 'full_day_trial';
  starts_at: string;
  ends_at: string;
  status: string;
  candidate_message: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type JobseekerApplicationDetail = {
  application: JobseekerApplicationSummary;
  interviews: JobseekerInterview[];
  visits: JobseekerApplicationVisit[];
};

export type JobseekerMessage = {
  id: string;
  thread_id: string;
  sender_role: 'jobseeker' | 'facility';
  body: string;
  created_at: string;
};

export type VisitExperienceType = 'visit' | 'half_day_trial' | 'full_day_trial';

export type JobseekerVisitSettings = {
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

export type JobseekerVisitHistory = {
  reservation_id: string;
  job_id: string;
  application_id: string | null;
  facility_name: string;
  job_title: string;
  prefecture: string | null;
  city: string | null;
  address: string | null;
  experience_type: VisitExperienceType;
  starts_at: string;
  ends_at: string;
  status: string;
  candidate_message: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationDocumentHandoffState = {
  expectedCount: number;
  submittedFromVaultCount: number;
  missingSourceDocumentIds: string[];
};

export async function listApplications(client: SupabaseClient): Promise<JobseekerApplicationSummary[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_applications');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as JobseekerApplicationSummary[];
}

export async function getApplicationDetail(
  client: SupabaseClient,
  applicationId: string,
): Promise<JobseekerApplicationDetail | null> {
  assertUuid(applicationId, '応募ID');
  const { data, error } = await client.rpc('hc_jobseeker_get_application_detail', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const row = data as Partial<JobseekerApplicationDetail>;
  if (!row.application || row.application.id !== applicationId) {
    throw new Error('応募情報の整合性を確認できませんでした。');
  }
  return {
    application: row.application,
    interviews: Array.isArray(row.interviews) ? row.interviews : [],
    visits: Array.isArray(row.visits) ? row.visits : [],
  };
}

export async function listApplicationMessages(
  client: SupabaseClient,
  applicationId: string,
): Promise<JobseekerMessage[]> {
  assertUuid(applicationId, '応募ID');
  const { data, error } = await client.rpc('hc_jobseeker_list_application_messages', {
    p_application_id: applicationId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as JobseekerMessage[];
}

export async function getCandidateJob(client: SupabaseClient, jobId: string): Promise<JobseekerJob | null> {
  assertUuid(jobId, '求人ID');
  const { data, error } = await client.rpc('hc_jobseeker_get_ranked_job', { p_job_id: jobId });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return (rows[0] as JobseekerJob | undefined) ?? null;
}

export async function submitApplication(
  client: SupabaseClient,
  jobId: string,
  profile: JobseekerProfile,
): Promise<{ applicationId: string; documentHandoffFailures: number }> {
  assertUuid(jobId, '求人ID');
  const applicantName = profile.name?.trim() ?? '';
  if (!applicantName) throw new Error('応募前にプロフィールのお名前を登録してください。');

  // The canonical server RPC is already idempotent for (job, authenticated jobseeker):
  // an ambiguous retry returns the existing application instead of inserting a second row.
  const { data, error } = await client.rpc('hc_jobseeker_submit_application', {
    p_job_id: jobId,
    p_applicant_name: applicantName,
    p_applicant_name_kana: cleanOptionalText(profile.name_kana),
    p_email: cleanOptionalText(profile.email),
    p_phone: cleanOptionalText(profile.phone),
    p_qualifications: profile.qualifications.length ? profile.qualifications.join('、') : null,
    p_years_of_experience: profile.years_of_experience,
    p_desired_start_date: profile.desired_start_date,
    p_message: cleanOptionalText(profile.self_intro),
  });
  if (error) throw error;
  if (typeof data !== 'string' || !UUID_PATTERN.test(data)) {
    throw new Error('応募結果を確認できませんでした。');
  }

  const detail = await getApplicationDetail(client, data);
  if (!detail || detail.application.job_id !== jobId) {
    throw new Error('応募結果を確認できませんでした。再読み込みして確認してください。');
  }

  let documentHandoffFailures = 0;
  try {
    const defaults = (await listJobseekerDocuments(client)).filter((document) => document.is_default);
    const results = await Promise.allSettled(
      defaults.map((document) => attachJobseekerDocumentToApplication(client, document, data)),
    );
    documentHandoffFailures = results.filter((result) => result.status === 'rejected').length;
  } catch {
    // The application is already canonical at this point. Never report it as failed
    // because a recoverable document handoff had a network/storage error.
    documentHandoffFailures = 1;
  }

  return { applicationId: data, documentHandoffFailures };
}

export async function getApplicationDocumentHandoffState(
  client: SupabaseClient,
  applicationId: string,
): Promise<ApplicationDocumentHandoffState> {
  assertUuid(applicationId, '応募ID');
  const [expectations, submitted] = await Promise.all([
    listApplicationDocumentExpectations(client, applicationId),
    listSubmittedApplicationDocuments(client, applicationId),
  ]);
  const submittedSourceIds = new Set(
    submitted.flatMap((document) => document.source_jobseeker_document_id ? [document.source_jobseeker_document_id] : []),
  );
  const expectedSourceIds = [...new Set(expectations.map((expectation) => expectation.source_jobseeker_document_id_snapshot))];
  return {
    expectedCount: expectedSourceIds.length,
    submittedFromVaultCount: expectedSourceIds.filter((id) => submittedSourceIds.has(id)).length,
    missingSourceDocumentIds: expectedSourceIds.filter((id) => !submittedSourceIds.has(id)),
  };
}

export async function repairApplicationDocumentHandoff(
  client: SupabaseClient,
  applicationId: string,
): Promise<{ state: ApplicationDocumentHandoffState; failed: number }> {
  const before = await getApplicationDocumentHandoffState(client, applicationId);
  if (!before.missingSourceDocumentIds.length) return { state: before, failed: 0 };
  const documents = await listJobseekerDocuments(client);
  const byId = new Map(documents.map((document) => [document.id, document]));
  const results = await Promise.allSettled(
    before.missingSourceDocumentIds.map(async (documentId) => {
      const document = byId.get(documentId);
      if (!document) throw new Error('元の応募書類が見つかりません。');
      return attachJobseekerDocumentToApplication(client, document, applicationId);
    }),
  );
  const state = await getApplicationDocumentHandoffState(client, applicationId);
  return { state, failed: results.filter((result) => result.status === 'rejected').length };
}

export async function sendApplicationMessageDurable(params: {
  client: SupabaseClient;
  ownerId: string;
  ownerSessionId: string;
  applicationId: string;
  body: string;
}): Promise<JobseekerMessage> {
  assertUuid(params.applicationId, '応募ID');
  const body = params.body.trim();
  if (!body) throw new Error('メッセージを入力してください。');
  if (body.length > 4000) throw new Error('メッセージは4000文字以内で入力してください。');
  const lease = captureDurableMutationSessionLease(params.ownerId, params.ownerSessionId);
  const { envelope } = await prepareDurableMutation({
    userId: params.ownerId,
    kind: 'message',
    scopeId: params.applicationId,
    payloadParts: [params.applicationId, body],
    lease,
  });

  const { data, error } = await params.client.rpc('hc_send_message_v2', {
    p_application_id: params.applicationId,
    p_body: body,
    p_client_request_id: envelope.requestId,
  });
  if (error) throw error;
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof (data as { id?: unknown }).id !== 'string') {
    throw new Error('メッセージ送信結果を確認できませんでした。');
  }

  // Do not clear the durable retry key until the candidate-safe canonical read
  // confirms the exact resource. If this read is interrupted, a retry reuses the
  // same request id and the backend receipt returns the original message.
  const messages = await listApplicationMessages(params.client, params.applicationId);
  const confirmed = messages.find((message) => message.id === (data as { id: string }).id);
  if (!confirmed || confirmed.sender_role !== 'jobseeker' || confirmed.body !== body) {
    throw new Error('メッセージ送信結果を確認できませんでした。再読み込みして確認してください。');
  }
  await clearDurableMutation({ userId: params.ownerId, kind: 'message', scopeId: params.applicationId });
  return confirmed;
}

export async function respondToInterviewDurable(params: {
  client: SupabaseClient;
  ownerId: string;
  ownerSessionId: string;
  applicationId: string;
  interviewId: string;
  responseStatus: JobseekerInterviewResponseStatus;
  candidateMessage?: string | null;
}) {
  assertUuid(params.applicationId, '応募ID');
  assertUuid(params.interviewId, '面接ID');
  const message = cleanOptionalText(params.candidateMessage);
  if (!['accepted', 'reschedule_requested'].includes(params.responseStatus)) {
    throw new Error('面接への回答を確認できませんでした。');
  }
  if (message && message.length > 1000) throw new Error('連絡事項は1000文字以内で入力してください。');
  if (params.responseStatus === 'reschedule_requested' && !message) {
    throw new Error('日程変更を希望する場合は、希望日時や都合のよい時間帯を入力してください。');
  }

  const lease = captureDurableMutationSessionLease(params.ownerId, params.ownerSessionId);
  await prepareDurableMutation({
    userId: params.ownerId,
    kind: 'interview',
    scopeId: params.interviewId,
    payloadParts: [params.applicationId, params.interviewId, params.responseStatus, message],
    lease,
  });

  // This canonical RPC itself is content-idempotent: an exact retry upserts the
  // same response and only emits the candidate message when the response changed.
  const { error } = await params.client.rpc('hc_jobseeker_respond_interview', {
    p_interview_id: params.interviewId,
    p_response_status: params.responseStatus,
    p_candidate_message: message,
  });
  if (error) throw error;

  const detail = await getApplicationDetail(params.client, params.applicationId);
  const confirmed = detail?.interviews.find((interview) => interview.id === params.interviewId);
  if (
    !confirmed ||
    confirmed.candidate_response_status !== params.responseStatus ||
    (confirmed.candidate_response_message ?? null) !== (message ?? null)
  ) {
    throw new Error('面接回答の反映を確認できませんでした。再読み込みして確認してください。');
  }
  await clearDurableMutation({ userId: params.ownerId, kind: 'interview', scopeId: params.interviewId });
}

export async function getVisitSettings(
  client: SupabaseClient,
  jobId: string,
): Promise<JobseekerVisitSettings | null> {
  assertUuid(jobId, '求人ID');
  const { data, error } = await client.rpc('hc_jobseeker_get_visit_settings', { p_job_id: jobId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? row as JobseekerVisitSettings : null;
}

export async function listCandidateVisits(client: SupabaseClient): Promise<JobseekerVisitHistory[]> {
  const { data, error } = await client.rpc('hc_jobseeker_list_my_visits');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as JobseekerVisitHistory[];
}

export async function requestVisitDurable(params: {
  client: SupabaseClient;
  ownerId: string;
  ownerSessionId: string;
  jobId: string;
  applicationId?: string | null;
  experienceType: VisitExperienceType;
  localDate: string;
  localTime: string;
  candidateMessage?: string | null;
}): Promise<string> {
  assertUuid(params.jobId, '求人ID');
  if (params.applicationId) assertUuid(params.applicationId, '応募ID');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.localDate)) throw new Error('希望日をYYYY-MM-DD形式で入力してください。');
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(params.localTime)) throw new Error('希望時刻をHH:MM形式で入力してください。');
  const message = cleanOptionalText(params.candidateMessage);
  const scopeId = `${params.jobId}:${params.applicationId ?? 'none'}`;
  const lease = captureDurableMutationSessionLease(params.ownerId, params.ownerSessionId);
  const { envelope } = await prepareDurableMutation({
    userId: params.ownerId,
    kind: 'visit',
    scopeId,
    payloadParts: [
      params.jobId,
      params.applicationId ?? null,
      params.experienceType,
      params.localDate,
      params.localTime,
      message,
    ],
    lease,
  });

  const { data, error } = await params.client.rpc('hc_request_visit_v2', {
    p_job_id: params.jobId,
    p_experience_type: params.experienceType,
    p_local_date: params.localDate,
    p_local_time: params.localTime,
    p_application_id: params.applicationId ?? null,
    p_candidate_message: message,
    p_client_request_id: envelope.requestId,
  });
  if (error) throw error;
  if (typeof data !== 'string' || !UUID_PATTERN.test(data)) throw new Error('見学・体験予約結果を確認できませんでした。');

  const visits = await listCandidateVisits(params.client);
  if (!visits.some((visit) => visit.reservation_id === data)) {
    throw new Error('見学・体験予約結果を確認できませんでした。再読み込みして確認してください。');
  }
  await clearDurableMutation({ userId: params.ownerId, kind: 'visit', scopeId });
  return data;
}

export async function cancelVisit(client: SupabaseClient, reservationId: string) {
  assertUuid(reservationId, '予約ID');
  const { data, error } = await client.rpc('hc_cancel_visit', { p_reservation_id: reservationId });
  if (error) throw error;
  if (data !== true) throw new Error('予約をキャンセルできませんでした。');
  const visits = await listCandidateVisits(client);
  const visit = visits.find((row) => row.reservation_id === reservationId);
  if (!visit || visit.status !== 'cancelled') {
    throw new Error('キャンセル結果を確認できませんでした。再読み込みして確認してください。');
  }
}
