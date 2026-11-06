import { buildResumePdfIdentity, type ResumePdfIdentity } from './resumePdfIdentity.ts';

/** Web /resume final-review presentation from existing candidate-owned canonical records.
 * This is derived display state, NEVER a new record or proof of a verified qualification.
 */
export type ReviewProfile = {
  name: string | null; name_kana: string | null; phone: string | null;
  email: string | null; qualifications: string[]; years_of_experience: number | null;
};
export type ReviewEducation = {
  organization: string; department: string | null; start_ym: string | null;
  end_ym: string | null; is_current: boolean; education_status: string | null;
};
export type ReviewEmployment = {
  organization: string; department: string | null; start_ym: string | null;
  end_ym: string | null; is_current: boolean; facility_type: string | null;
  employment_type: string | null; job_title: string | null; age_groups: string[];
  class_lead: boolean; management_role: string | null; children_count: string | null;
  duties: string | null; achievements: string | null; leaving_reason: string | null;
};
export type ReviewResume = {
  birth_date: string | null; gender: string | null; postal_code: string | null;
  address: string | null; address_kana: string | null; contact_address: string | null;
  qualification_acquired: Record<string, string>; education: ReviewEducation[];
  employment: ReviewEmployment[]; motivation: string | null; self_pr: string | null;
  strengths: string | null; work_summary: string | null; personal_requests: string | null;
};
export type ReviewPreferences = { classroom_experience: string[]; leadership_roles: string[] };
export type ReviewRow = { year: string; month: string; label: string; align?: 'center' | 'right' };
export type ReviewSection = { title: string; lines: string[] };
export type ResumeReview = {
  name: string; kana: string; birth: string; gender: string;
  address: string; contact: string; createdOn: string;
  history: ReviewRow[]; licenses: ReviewRow[]; work: ReviewSection[];
  /** PDF-only field separation; old compact address/contact strings remain for UI compatibility. */
  pdfIdentity?: ResumePdfIdentity;
  appeal: ReviewSection[]; requests: string; gaps: string[];
};
const clean = (value: string | null | undefined) => (value ?? '').trim();
const ym = (value: string | null) => {
  if (!value) return { year: '', month: '' };
  const [year, month] = value.split('-');
  return { year, month: String(Number(month)) };
};
const fmt = (value: string | null) => {
  const v = ym(value);
  return v.year ? `${v.year}年${v.month}月` : '';
};
function age(birth: string | null, now: Date): string {
  if (!birth || !/^\d{4}-\d\d-\d\d$/.test(birth)) return '';
  const [y, m, d] = birth.split('-').map(Number);
  const birthDate = new Date(y, m - 1, d);
  if (birthDate.getFullYear() !== y || birthDate.getMonth() !== m - 1 || birthDate.getDate() !== d) return '';
  const years = now.getFullYear() - y - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0);
  if (years < 0 || years > 120) return '';
  return `${y}年${m}月${d}日生（満${years}歳）`;
}
const chronological = <T extends { start_ym: string | null }>(rows: T[]) =>
  [...rows].sort((a, b) => (a.start_ym ?? '9999').localeCompare(b.start_ym ?? '9999'));

export function buildResumeReview(profile: ReviewProfile, resume: ReviewResume, prefs: ReviewPreferences, createdOn: Date): ResumeReview {
  const history: ReviewRow[] = [];
  const schools = chronological(resume.education.filter((row) => clean(row.organization)));
  if (schools.length) {
    history.push({ year: '', month: '', label: '学歴', align: 'center' });
    for (const school of schools) {
      const name = `${clean(school.organization)}${clean(school.department) ? ' ' + clean(school.department) : ''}`;
      if (school.start_ym) history.push({ ...ym(school.start_ym), label: `${name} 入学` });
      if (school.is_current || school.education_status === '在学中') {
        if (!school.start_ym) history.push({ year: '', month: '', label: `${name} 在学中` });
      } else if (school.end_ym || school.education_status) {
        history.push({ ...ym(school.end_ym), label: `${name} ${school.education_status ?? '卒業'}` });
      } else if (!school.start_ym) history.push({ year: '', month: '', label: name });
    }
  }
  history.push({ year: '', month: '', label: '職歴', align: 'center' });
  const jobs = chronological(resume.employment.filter((row) => clean(row.organization)));
  if (!jobs.length) history.push({ year: '', month: '', label: 'なし' });
  for (const job of jobs) {
    const kind = [clean(job.facility_type), clean(job.employment_type)].filter(Boolean).join('・');
    history.push({ ...ym(job.start_ym), label: `${clean(job.organization)}${clean(job.department) ? ' ' + clean(job.department) : ''} 入職${kind ? `（${kind}）` : ''}` });
    if (!job.is_current && job.end_ym) history.push({ ...ym(job.end_ym), label: clean(job.leaving_reason) || '退職' });
  }
  if (jobs.some((job) => job.is_current)) history.push({ year: '', month: '', label: '現在に至る' });
  history.push({ year: '', month: '', label: '以上', align: 'right' });
  const licenses = profile.qualifications.map((name) => ({ name, date: resume.qualification_acquired[name] ?? null }))
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
    .map(({ name, date }) => ({ ...ym(date), label: `${name} 取得` }));
  const work: ReviewSection[] = [];
  if (clean(resume.work_summary)) work.push({ title: '職務要約', lines: [clean(resume.work_summary)] });
  const experience: string[] = [];
  if (profile.years_of_experience != null) experience.push(`保育経験：${profile.years_of_experience}年`);
  if (prefs.classroom_experience.length) experience.push(`担当経験：${prefs.classroom_experience.join('、')}`);
  if (prefs.leadership_roles.length) experience.push(`リーダー・管理職：${prefs.leadership_roles.join('、')}`);
  if (experience.length) work.push({ title: '保育の経験', lines: experience });
  for (const job of [...jobs].reverse()) {
    const details = [job.department, job.facility_type, job.employment_type, job.job_title].map(clean).filter(Boolean);
    const lines = [
      `${fmt(job.start_ym)}〜${job.is_current ? '現在' : fmt(job.end_ym)}`,
      details.join('／'),
      job.age_groups.length ? `担当年齢：${job.age_groups.join('、')}` : '',
      job.class_lead ? 'クラス担任：あり' : '',
      clean(job.management_role) ? `役割・役職：${clean(job.management_role)}` : '',
      clean(job.children_count) ? `規模：${clean(job.children_count)}` : '',
      clean(job.duties) ? `業務内容：${clean(job.duties)}` : '',
      clean(job.achievements) ? `実績・工夫したこと：${clean(job.achievements)}` : '',
    ].filter(Boolean);
    work.push({ title: clean(job.organization), lines });
  }
  if (licenses.length) work.push({ title: '資格・免許', lines: profile.qualifications.map((name) =>
    `${name}${resume.qualification_acquired[name] ? `（${fmt(resume.qualification_acquired[name])}取得）` : ''}`) });
  const appeal = [
    { title: '志望の動機', lines: [clean(resume.motivation)] },
    { title: '自己PR', lines: [clean(resume.self_pr)] },
    { title: '得意なこと・強み', lines: [clean(resume.strengths)] },
  ].filter((section) => section.lines[0]);
  if (clean(resume.strengths)) work.push({ title: '得意なこと・強み', lines: [clean(resume.strengths)] });
  if (clean(resume.self_pr)) work.push({ title: '自己PR', lines: [clean(resume.self_pr)] });
  const gaps: string[] = [];
  if (!clean(profile.name)) gaps.push('お名前');
  if (!resume.birth_date) gaps.push('生年月日');
  if (!clean(resume.address)) gaps.push('住所');
  if (!clean(profile.phone) && !clean(profile.email)) gaps.push('電話番号かメールアドレス');
  if (!schools.length) gaps.push('学歴');
  if (!clean(resume.motivation) && !clean(resume.self_pr)) gaps.push('志望動機か自己PR');
  return {
    createdOn: `${createdOn.getFullYear()}年${createdOn.getMonth() + 1}月${createdOn.getDate()}日現在`,
    name: clean(profile.name), kana: clean(profile.name_kana), birth: age(resume.birth_date, createdOn), gender: clean(resume.gender),
    address: [clean(resume.postal_code), clean(resume.address_kana), clean(resume.address)].filter(Boolean).join(' / '),
    contact: [clean(profile.phone), clean(profile.email), clean(resume.contact_address)].filter(Boolean).join(' / '),
    history, licenses, work, appeal, requests: clean(resume.personal_requests) || '貴園の規定に従います。', gaps,
    pdfIdentity: buildResumePdfIdentity(profile, resume),
  };
}
