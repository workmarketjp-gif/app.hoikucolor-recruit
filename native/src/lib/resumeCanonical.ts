import type { SupabaseClient } from '@supabase/supabase-js';

/** Same candidate-owned structured record and optimistic revision RPC as Web /resume. */
export type ResumeEducation = {
  id: string; start_ym: string | null; end_ym: string | null; is_current: boolean;
  organization: string; department: string | null; education_status: string | null;
};
export type ResumeEmployment = {
  id: string; start_ym: string | null; end_ym: string | null; is_current: boolean;
  organization: string; department: string | null; facility_type: string | null;
  employment_type: string | null; job_title: string | null; age_groups: string[];
  class_lead: boolean; management_role: string | null; children_count: string | null;
  duties: string | null; achievements: string | null; leaving_reason: string | null;
};
export type CandidateResume = {
  revision: number; updated_at: string | null; birth_date: string | null; gender: string | null;
  postal_code: string | null; address: string | null; address_kana: string | null;
  contact_address: string | null; qualification_acquired: Record<string, string>;
  work_summary: string | null; self_pr: string | null; strengths: string | null;
  motivation: string | null; personal_requests: string | null;
  education: ResumeEducation[]; employment: ResumeEmployment[];
};
export class ResumeRevisionConflict extends Error {
  constructor() { super('別の画面や端末で先に保存されました。最新の内容を読み込み直してください。'); this.name = 'ResumeRevisionConflict'; }
}
export class ResumeReadbackUnconfirmed extends Error {
  constructor() { super('保存結果を確認できませんでした。自動で再送信せず、最新の履歴書を確認してください。'); this.name = 'ResumeReadbackUnconfirmed'; }
}
const YM = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;
const nullable = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const month = (v: unknown): string | null => typeof v === 'string' && YM.test(v) ? v : null;
const list = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x)) : [];
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const id = (v: unknown): string => typeof v === 'string' ? v : '';
const current = (v: unknown): boolean => v === true;
const educationStatuses = new Set(['卒業', '卒業見込み', '修了', '中退', '在学中']);
const nullableEducationStatus = (v: unknown) => typeof v === 'string' && educationStatuses.has(v) ? v : null;

export function normalizeCandidateResume(value: unknown): CandidateResume {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const acquired: Record<string, string> = {};
  if (row.qualification_acquired && typeof row.qualification_acquired === 'object' && !Array.isArray(row.qualification_acquired)) {
    for (const [name, date] of Object.entries(row.qualification_acquired)) {
      const valid = month(date);
      if (valid) acquired[name] = valid;
    }
  }
  return {
    revision: Number.isSafeInteger(row.revision) && Number(row.revision) >= 0 ? Number(row.revision) : 0,
    updated_at: nullable(row.updated_at), birth_date: nullable(row.birth_date), gender: nullable(row.gender),
    postal_code: nullable(row.postal_code), address: nullable(row.address), address_kana: nullable(row.address_kana),
    contact_address: nullable(row.contact_address), qualification_acquired: acquired,
    work_summary: nullable(row.work_summary), self_pr: nullable(row.self_pr), strengths: nullable(row.strengths),
    motivation: nullable(row.motivation), personal_requests: nullable(row.personal_requests),
    education: list(row.education).map((e) => ({
      id: id(e.id), start_ym: month(e.start_ym), end_ym: month(e.end_ym), is_current: current(e.is_current),
      organization: typeof e.organization === 'string' ? e.organization : '', department: nullable(e.department),
      education_status: nullableEducationStatus(e.education_status),
    })),
    employment: list(row.employment).map((e) => ({
      id: id(e.id), start_ym: month(e.start_ym), end_ym: month(e.end_ym), is_current: current(e.is_current),
      organization: typeof e.organization === 'string' ? e.organization : '', department: nullable(e.department),
      facility_type: nullable(e.facility_type), employment_type: nullable(e.employment_type),
      job_title: nullable(e.job_title), age_groups: strings(e.age_groups), class_lead: current(e.class_lead),
      management_role: nullable(e.management_role), children_count: nullable(e.children_count),
      duties: nullable(e.duties), achievements: nullable(e.achievements), leaving_reason: nullable(e.leaving_reason),
    })),
  };
}

/** Server persists only named school/workplace rows, exactly as Web /resume. */
export function toResumePayload(value: CandidateResume): Omit<CandidateResume, 'revision' | 'updated_at'> {
  const { revision: _revision, updated_at: _updatedAt, ...data } = value;
  return {
    ...data,
    education: data.education.filter((e) => e.organization.trim()),
    employment: data.employment.filter((e) => e.organization.trim()),
  };
}

export async function getCandidateResume(client: SupabaseClient): Promise<CandidateResume> {
  const { data, error } = await client.rpc('hc_jobseeker_get_resume');
  if (error) throw error;
  return normalizeCandidateResume(data);
}

/** Never retry an ambiguous save. Canonical readback must confirm revision AND content. */
export async function saveCandidateResumeAndConfirm(client: SupabaseClient, draft: CandidateResume): Promise<CandidateResume> {
  const expected = toResumePayload(draft);
  const { error } = await client.rpc('hc_jobseeker_save_resume', {
    p_expected_revision: draft.revision,
    p_resume: expected,
  });
  if (error) {
    if (String(error.message).includes('HC_RESUME_REVISION_CONFLICT')) throw new ResumeRevisionConflict();
    if (String(error.message).includes('HC_RESUME_TEXT_TOO_LONG')) throw new Error('文字数が多すぎる項目があります。短くしてから保存してください。');
    if (String(error.message).includes('HC_RESUME_INVALID_BIRTH_DATE')) throw new Error('生年月日を確認してください。');
    if (String(error.message).includes('HC_ACCOUNT_DELETION_IN_PROGRESS')) throw new Error('退会手続き中のため保存できません。');
    throw new ResumeReadbackUnconfirmed();
  }
  let actual: CandidateResume;
  try { actual = await getCandidateResume(client); }
  catch { throw new ResumeReadbackUnconfirmed(); }
  if (actual.revision <= draft.revision || JSON.stringify(toResumePayload(actual)) !== JSON.stringify(expected)) {
    throw new ResumeReadbackUnconfirmed();
  }
  return actual;
}
