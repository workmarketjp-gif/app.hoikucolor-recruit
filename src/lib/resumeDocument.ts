import type { JobseekerProfile } from './recruitRepository';
import { ageOn, formatYm, type JobseekerResume, type ResumeEmployment } from './resumeRepository';

/**
 * One content model for both documents. The on-screen preview and the A4 PDF render the
 * same rows, so what the candidate checks is what the facility receives.
 * Everything here comes from the candidate's own entries; nothing is inferred or invented.
 */
export type ResumeSourceData = {
  profile: JobseekerProfile;
  /** 担当経験 / リーダー・管理職経験 from the matching-preferences part of the profile. */
  classroomExperience: string[];
  leadershipRoles: string[];
  resume: JobseekerResume;
  createdOn: Date;
};

export type HistoryRow = { year: string; month: string; text: string; align?: 'center' | 'right' };

export type ResumeModel = {
  createdOn: string;
  nameKana: string;
  name: string;
  birthLine: string;
  gender: string;
  postalCode: string;
  addressKana: string;
  address: string;
  phone: string;
  email: string;
  contactAddress: string;
  history: HistoryRow[];
  licenses: HistoryRow[];
  appeal: { heading: string; body: string }[];
  requests: string;
};

export type WorkHistoryFact = [label: string, value: string];
export type WorkHistoryJob = {
  period: string;
  organization: string;
  subtitle: string;
  facts: WorkHistoryFact[];
  paragraphs: { label: string; text: string }[];
};
export type WorkHistorySection =
  | { kind: 'paragraph'; title: string; text: string }
  | { kind: 'facts'; title: string; facts: WorkHistoryFact[] }
  | { kind: 'jobs'; title: string; jobs: WorkHistoryJob[] }
  | { kind: 'list'; title: string; items: string[] };

export type WorkHistoryModel = {
  createdOn: string;
  name: string;
  sections: WorkHistorySection[];
};

export function formatCreatedOn(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日現在`;
}

function ymParts(value: string | null): [string, string] {
  if (!value) return ['', ''];
  const [year, month] = value.split('-');
  return [year, String(Number(month))];
}

function clean(value: string | null | undefined) {
  return (value ?? '').trim();
}

function birthLine(birthDate: string | null, today: Date) {
  if (!birthDate) return '';
  const [y, m, d] = birthDate.split('-').map(Number);
  const age = ageOn(birthDate, today);
  return `${y}年${m}月${d}日生${age === null ? '' : `（満${age}歳）`}`;
}

function employmentStartText(job: ResumeEmployment) {
  const extra = [clean(job.facility_type), clean(job.employment_type)].filter(Boolean).join('・');
  const department = clean(job.department);
  return `${clean(job.organization)}${department ? ` ${department}` : ''} 入職${extra ? `（${extra}）` : ''}`;
}

/** Most recent first for the work history; oldest first for the résumé table (Japanese convention). */
function chronological<T extends { start_ym: string | null }>(items: T[]) {
  return [...items].sort((a, b) => (a.start_ym ?? '9999').localeCompare(b.start_ym ?? '9999'));
}

export function buildResumeModel(data: ResumeSourceData): ResumeModel {
  const { profile, resume } = data;
  const history: HistoryRow[] = [];

  const education = chronological(resume.education.filter((item) => clean(item.organization)));
  if (education.length) {
    history.push({ year: '', month: '', text: '学歴', align: 'center' });
    for (const school of education) {
      const name = `${clean(school.organization)}${clean(school.department) ? ` ${clean(school.department)}` : ''}`;
      if (school.start_ym) {
        const [year, month] = ymParts(school.start_ym);
        history.push({ year, month, text: `${name} 入学` });
      }
      if (school.is_current || school.education_status === '在学中') {
        if (!school.start_ym) history.push({ year: '', month: '', text: `${name} 在学中` });
      } else if (school.end_ym || school.education_status) {
        const [year, month] = ymParts(school.end_ym);
        history.push({ year, month, text: `${name} ${school.education_status ?? '卒業'}` });
      } else if (!school.start_ym) {
        history.push({ year: '', month: '', text: name });
      }
    }
  }

  history.push({ year: '', month: '', text: '職歴', align: 'center' });
  const jobs = chronological(resume.employment.filter((item) => clean(item.organization)));
  if (!jobs.length) history.push({ year: '', month: '', text: 'なし' });
  for (const job of jobs) {
    const [year, month] = ymParts(job.start_ym);
    history.push({ year, month, text: employmentStartText(job) });
    if (!job.is_current && job.end_ym) {
      const [endYear, endMonth] = ymParts(job.end_ym);
      history.push({ year: endYear, month: endMonth, text: clean(job.leaving_reason) || '退職' });
    }
  }
  if (jobs.some((job) => job.is_current)) history.push({ year: '', month: '', text: '現在に至る' });
  history.push({ year: '', month: '', text: '以上', align: 'right' });

  const licenses: HistoryRow[] = [...profile.qualifications]
    .map((name) => ({ name, acquired: resume.qualification_acquired[name] ?? null }))
    .sort((a, b) => (a.acquired ?? '9999').localeCompare(b.acquired ?? '9999'))
    .map(({ name, acquired }) => {
      const [year, month] = ymParts(acquired);
      return { year, month, text: `${name} 取得` };
    });

  const appeal = [
    { heading: '志望の動機', body: clean(resume.motivation) },
    { heading: '自己PR', body: clean(resume.self_pr) },
    { heading: '得意なこと・強み', body: clean(resume.strengths) },
  ].filter((item) => item.body);

  return {
    createdOn: formatCreatedOn(data.createdOn),
    nameKana: clean(profile.name_kana),
    name: clean(profile.name),
    birthLine: birthLine(resume.birth_date, data.createdOn),
    gender: clean(resume.gender),
    postalCode: clean(resume.postal_code),
    addressKana: clean(resume.address_kana),
    address: clean(resume.address),
    phone: clean(profile.phone),
    email: clean(profile.email),
    contactAddress: clean(resume.contact_address),
    history,
    licenses,
    appeal,
    requests: clean(resume.personal_requests) || '貴園の規定に従います。',
  };
}

function periodText(job: ResumeEmployment) {
  const start = formatYm(job.start_ym);
  const end = job.is_current ? '現在' : formatYm(job.end_ym);
  if (!start && !end) return '';
  return `${start}〜${end}`;
}

export function buildWorkHistoryModel(data: ResumeSourceData): WorkHistoryModel {
  const { profile, resume } = data;
  const sections: WorkHistorySection[] = [];

  if (clean(resume.work_summary)) sections.push({ kind: 'paragraph', title: '職務要約', text: clean(resume.work_summary) });

  const experienceFacts: WorkHistoryFact[] = [];
  if (profile.years_of_experience !== null) experienceFacts.push(['保育経験', `${profile.years_of_experience}年`]);
  if (data.classroomExperience.length) experienceFacts.push(['担当経験', data.classroomExperience.join('、')]);
  if (data.leadershipRoles.length) experienceFacts.push(['リーダー・管理職', data.leadershipRoles.join('、')]);
  if (experienceFacts.length) sections.push({ kind: 'facts', title: '保育の経験', facts: experienceFacts });

  const jobs = chronological(resume.employment.filter((item) => clean(item.organization))).reverse();
  if (jobs.length) {
    sections.push({
      kind: 'jobs',
      title: '職務経歴',
      jobs: jobs.map((job) => {
        const facts: WorkHistoryFact[] = [];
        if (job.age_groups.length) facts.push(['担当年齢', job.age_groups.join('、')]);
        if (job.class_lead) facts.push(['クラス担任', 'あり']);
        if (clean(job.management_role)) facts.push(['役割・役職', clean(job.management_role)]);
        if (clean(job.children_count)) facts.push(['規模', clean(job.children_count)]);
        const paragraphs = [
          { label: '業務内容', text: clean(job.duties) },
          { label: '実績・工夫したこと', text: clean(job.achievements) },
        ].filter((item) => item.text);
        return {
          period: periodText(job),
          organization: clean(job.organization),
          subtitle: [clean(job.department), clean(job.facility_type), clean(job.employment_type), clean(job.job_title)].filter(Boolean).join('／'),
          facts,
          paragraphs,
        };
      }),
    });
  }

  if (profile.qualifications.length) {
    sections.push({
      kind: 'list',
      title: '資格・免許',
      items: profile.qualifications.map((name) => {
        const acquired = resume.qualification_acquired[name];
        return acquired ? `${name}（${formatYm(acquired)}取得）` : name;
      }),
    });
  }

  if (clean(resume.strengths)) sections.push({ kind: 'paragraph', title: '得意なこと・強み', text: clean(resume.strengths) });
  if (clean(resume.self_pr)) sections.push({ kind: 'paragraph', title: '自己PR', text: clean(resume.self_pr) });

  return { createdOn: formatCreatedOn(data.createdOn), name: clean(profile.name), sections };
}

/** Plain-language gaps shown before creating the PDFs. Only the name blocks creation. */
export function resumeGaps(data: ResumeSourceData) {
  const gaps: string[] = [];
  if (!clean(data.profile.name)) gaps.push('お名前');
  if (!data.resume.birth_date) gaps.push('生年月日');
  if (!clean(data.resume.address)) gaps.push('住所');
  if (!clean(data.profile.phone) && !clean(data.profile.email)) gaps.push('電話番号かメールアドレス');
  if (!data.resume.education.some((item) => clean(item.organization))) gaps.push('学歴');
  if (!clean(data.resume.motivation) && !clean(data.resume.self_pr)) gaps.push('志望動機か自己PR');
  return gaps;
}
