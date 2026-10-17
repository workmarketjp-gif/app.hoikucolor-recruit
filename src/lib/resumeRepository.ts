import { supabase } from './supabase';

/**
 * Structured résumé (履歴書) / work-history (職務経歴書) data. This is the source of truth;
 * PDFs are generated from it and saved to the document vault. Name, kana, contact,
 * qualifications, experience years, 担当年齢 and リーダー経験 live on the candidate profile
 * and are never copied here.
 */
export type ResumeEducation = {
  id: string;
  start_ym: string | null;
  end_ym: string | null;
  is_current: boolean;
  organization: string;
  department: string | null;
  education_status: EducationStatus | null;
};

export type ResumeEmployment = {
  id: string;
  start_ym: string | null;
  end_ym: string | null;
  is_current: boolean;
  organization: string;
  department: string | null;
  facility_type: string | null;
  employment_type: string | null;
  job_title: string | null;
  age_groups: string[];
  class_lead: boolean;
  management_role: string | null;
  children_count: string | null;
  duties: string | null;
  achievements: string | null;
  leaving_reason: string | null;
};

export type JobseekerResume = {
  revision: number;
  updated_at: string | null;
  birth_date: string | null;
  gender: string | null;
  postal_code: string | null;
  address: string | null;
  address_kana: string | null;
  contact_address: string | null;
  qualification_acquired: Record<string, string>;
  work_summary: string | null;
  self_pr: string | null;
  strengths: string | null;
  motivation: string | null;
  personal_requests: string | null;
  education: ResumeEducation[];
  employment: ResumeEmployment[];
};

export const educationStatuses = ['卒業', '卒業見込み', '修了', '中退', '在学中'] as const;
export type EducationStatus = typeof educationStatuses[number];

export const resumeLimits = {
  education: 20,
  employment: 30,
  work_summary: 1500,
  self_pr: 2000,
  strengths: 1000,
  motivation: 1500,
  personal_requests: 500,
  duties: 2000,
  achievements: 2000,
} as const;

export const emptyResume: JobseekerResume = {
  revision: 0,
  updated_at: null,
  birth_date: null,
  gender: null,
  postal_code: null,
  address: null,
  address_kana: null,
  contact_address: null,
  qualification_acquired: {},
  work_summary: null,
  self_pr: null,
  strengths: null,
  motivation: null,
  personal_requests: null,
  education: [],
  employment: [],
};

export class ResumeConflictError extends Error {
  constructor() {
    super('別の画面や端末で先に保存されました。最新の内容を読み込み直してください。');
    this.name = 'ResumeConflictError';
  }
}

const YM = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;

function client() {
  if (!supabase) throw new Error('Supabaseの接続設定がありません。');
  return supabase;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function ym(value: unknown): string | null {
  return typeof value === 'string' && YM.test(value) ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function id(value: unknown) {
  return typeof value === 'string' && value ? value : crypto.randomUUID();
}

export function normalizeResume(value: unknown): JobseekerResume {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...emptyResume };
  const row = value as Record<string, unknown>;
  const acquired: Record<string, string> = {};
  if (row.qualification_acquired && typeof row.qualification_acquired === 'object') {
    for (const [name, date] of Object.entries(row.qualification_acquired as Record<string, unknown>)) {
      const parsed = ym(date);
      if (parsed) acquired[name] = parsed;
    }
  }
  const list = (key: string) => (Array.isArray(row[key]) ? row[key] as Record<string, unknown>[] : []);
  return {
    revision: typeof row.revision === 'number' ? row.revision : 0,
    updated_at: text(row.updated_at),
    birth_date: text(row.birth_date),
    gender: text(row.gender),
    postal_code: text(row.postal_code),
    address: text(row.address),
    address_kana: text(row.address_kana),
    contact_address: text(row.contact_address),
    qualification_acquired: acquired,
    work_summary: text(row.work_summary),
    self_pr: text(row.self_pr),
    strengths: text(row.strengths),
    motivation: text(row.motivation),
    personal_requests: text(row.personal_requests),
    education: list('education').map((item) => ({
      id: id(item.id),
      start_ym: ym(item.start_ym),
      end_ym: ym(item.end_ym),
      is_current: item.is_current === true,
      organization: typeof item.organization === 'string' ? item.organization : '',
      department: text(item.department),
      education_status: (educationStatuses as readonly string[]).includes(item.education_status as string)
        ? item.education_status as EducationStatus
        : null,
    })),
    employment: list('employment').map((item) => ({
      id: id(item.id),
      start_ym: ym(item.start_ym),
      end_ym: ym(item.end_ym),
      is_current: item.is_current === true,
      organization: typeof item.organization === 'string' ? item.organization : '',
      department: text(item.department),
      facility_type: text(item.facility_type),
      employment_type: text(item.employment_type),
      job_title: text(item.job_title),
      age_groups: strings(item.age_groups),
      class_lead: item.class_lead === true,
      management_role: text(item.management_role),
      children_count: text(item.children_count),
      duties: text(item.duties),
      achievements: text(item.achievements),
      leaving_reason: text(item.leaving_reason),
    })),
  };
}

export function newEducation(): ResumeEducation {
  return { id: crypto.randomUUID(), start_ym: null, end_ym: null, is_current: false, organization: '', department: null, education_status: null };
}

export function newEmployment(): ResumeEmployment {
  return {
    id: crypto.randomUUID(), start_ym: null, end_ym: null, is_current: false, organization: '', department: null,
    facility_type: null, employment_type: null, job_title: null, age_groups: [], class_lead: false,
    management_role: null, children_count: null, duties: null, achievements: null, leaving_reason: null,
  };
}

/** Rows without a school / workplace name are drafts the candidate has not filled in yet; they are not saved. */
function payload(resume: JobseekerResume) {
  const { revision: _revision, updated_at: _updatedAt, ...rest } = resume;
  return {
    ...rest,
    education: resume.education.filter((item) => item.organization.trim()),
    employment: resume.employment.filter((item) => item.organization.trim()),
  };
}

export async function getJobseekerResume(): Promise<JobseekerResume> {
  const { data, error } = await client().rpc('hc_jobseeker_get_resume');
  if (error) throw error;
  return normalizeResume(data);
}

/** Saves the whole résumé. The server rejects the write when another tab saved first. */
export async function saveJobseekerResume(resume: JobseekerResume): Promise<JobseekerResume> {
  const { data, error } = await client().rpc('hc_jobseeker_save_resume', {
    p_expected_revision: resume.revision,
    p_resume: payload(resume),
  });
  if (error) {
    if (error.message?.includes('HC_RESUME_REVISION_CONFLICT')) throw new ResumeConflictError();
    if (error.message?.includes('HC_RESUME_TEXT_TOO_LONG')) throw new Error('文字数が多すぎる項目があります。短くしてから保存してください。');
    if (error.message?.includes('HC_RESUME_INVALID_BIRTH_DATE')) throw new Error('生年月日を確認してください。');
    if (error.message?.includes('HC_ACCOUNT_DELETION_IN_PROGRESS')) throw new Error('退会手続き中のため保存できません。');
    throw new Error('自動保存できませんでした。通信状況を確認してください。');
  }
  return normalizeResume(data);
}

export function formatYm(value: string | null) {
  if (!value) return '';
  const [year, month] = value.split('-');
  return `${year}年${Number(month)}月`;
}

export function ageOn(birthDate: string | null, today = new Date()) {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}
