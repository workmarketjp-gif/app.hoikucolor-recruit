import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { InlineError, SkeletonList } from '../components/StateViews';
import { useCandidateSession } from '../lib/candidateSession';
import { uploadJobseekerDocument, type JobseekerDocumentType } from '../lib/documentVaultRepository';
import {
  emptyJobseekerMatchingPreferences,
  getJobseekerMatchingPreferences,
  saveJobseekerMatchingPreferences,
  type JobseekerMatchingPreferences,
} from '../lib/profilePreferencesRepository';
import { getProfile, upsertProfile, type JobseekerProfile } from '../lib/recruitRepository';
import {
  buildResumeModel,
  buildWorkHistoryModel,
  resumeGaps,
  type ResumeModel,
  type ResumeSourceData,
  type WorkHistoryModel,
} from '../lib/resumeDocument';
import { deleteResumePhoto, loadResumePhoto, prepareResumePhoto, saveResumePhoto } from '../lib/resumePhotoStore';
import {
  educationStatuses,
  getJobseekerResume,
  newEducation,
  newEmployment,
  resumeLimits,
  ResumeConflictError,
  saveJobseekerResume,
  type JobseekerResume,
  type ResumeEducation,
  type ResumeEmployment,
} from '../lib/resumeRepository';
import { requestWritingDraft, type WritingAssistField } from '../lib/resumeWritingAssist';
import { errorMessage } from '../lib/useResource';
import './ResumeBuilderView.css';

const steps = [
  { key: 'basic', label: '基本情報', question: 'あなたのことを教えてください' },
  { key: 'education', label: '学歴', question: 'どの学校を卒業しましたか？' },
  { key: 'employment', label: '職歴', question: 'これまで、どこで働きましたか？' },
  { key: 'licenses', label: '資格', question: 'どんな資格・免許を持っていますか？' },
  { key: 'childcare', label: '保育経験', question: '保育の経験を教えてください' },
  { key: 'writing', label: '自己PR', question: 'あなたの強みや思いを書きましょう' },
  { key: 'finish', label: '確認・作成', question: '内容を確認して、PDFを作りましょう' },
] as const;
type StepKey = typeof steps[number]['key'];

const qualificationOptions = ['保育士', '幼稚園教諭', '保育教諭', '看護師', '准看護師', '栄養士', '管理栄養士', '調理師', '子育て支援員', '普通自動車第一種運転免許'];
const ageGroupOptions = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', '異年齢', 'フリー'];
const classroomOptions = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', 'フリー', '異年齢保育', '障害児保育'];
const leadershipOptions = ['乳児リーダー', '幼児リーダー', '副主任', '主任', '園長', '施設長'];
const facilityTypeOptions = ['認可保育園', '認定こども園', '幼稚園', '小規模保育', '企業主導型保育', '事業所内保育', '認可外保育施設', '学童保育', '児童発達支援', '保育以外'];
const employmentTypeOptions = ['正社員', '契約社員', 'パート・アルバイト', '派遣'];
const leavingReasonOptions = ['一身上の都合により退職', '契約期間満了により退職', '会社都合により退職', '退職'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

/**
 * Debounced autosave of one value. Saves run one at a time; edits made while a save is
 * in flight are saved right after it. `flush` saves immediately (before PDF creation).
 */
function useAutosave<T>(value: T | null, save: (value: T) => Promise<void>, serialize: (value: T) => string) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const savedKey = useRef<string | null>(null);
  const latest = useRef<T | null>(value);
  const saveRef = useRef(save);
  const running = useRef<Promise<void> | null>(null);
  const blocked = useRef(false);
  latest.current = value;
  saveRef.current = save;

  const markSaved = useCallback((next: T) => { savedKey.current = serialize(next); }, [serialize]);

  const flush = useCallback(async (): Promise<boolean> => {
    // Drain: keep saving while the latest value differs from what the server has.
    for (let round = 0; round < 5; round += 1) {
      if (running.current) await running.current;
      const current = latest.current;
      if (current === null) return true;
      if (blocked.current) return false;
      const key = serialize(current);
      if (key === savedKey.current) return true;
      setState('saving');
      let ok = true;
      const run = (async () => {
        try {
          await saveRef.current(current);
          savedKey.current = key;
          setError(null);
          setState('saved');
        } catch (err) {
          ok = false;
          if (err instanceof ResumeConflictError) blocked.current = true;
          setError(errorMessage(err, '自動保存できませんでした。'));
          setState(err instanceof ResumeConflictError ? 'conflict' : 'error');
        }
      })();
      running.current = run;
      await run;
      running.current = null;
      if (!ok) return false;
    }
    return latest.current === null || serialize(latest.current) === savedKey.current;
  }, [serialize]);

  useEffect(() => {
    if (value === null || savedKey.current === null) return;
    if (serialize(value) === savedKey.current) return;
    const timer = window.setTimeout(() => { void flush(); }, 1200);
    return () => window.clearTimeout(timer);
  }, [value, serialize, flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [flush]);

  return { state, error, flush, markSaved };
}

const serializeResume = (value: JobseekerResume) => JSON.stringify({ ...value, revision: 0, updated_at: null });
const serializeJson = (value: unknown) => JSON.stringify(value);

function blankProfile(userId: string, email: string | null, name: string | null): JobseekerProfile {
  return {
    clerk_user_id: userId, email, name, name_kana: null, phone: null, prefecture: null,
    desired_positions: [], desired_employment_types: [], qualifications: [],
    years_of_experience: null, desired_start_date: null, self_intro: null,
  };
}

export function ResumeBuilderView({ onProfileSaved }: { onProfileSaved?: (profile: JobseekerProfile) => void }) {
  const session = useCandidateSession();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [preferences, setPreferences] = useState<JobseekerMatchingPreferences | null>(null);
  const [resume, setResume] = useState<JobseekerResume | null>(null);
  const revision = useRef(0);
  const [stepIndex, setStepIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const profileSave = useAutosave(profile, async (value) => {
    await upsertProfile(value);
    onProfileSaved?.(value);
  }, serializeJson);
  const preferencesSave = useAutosave(preferences, saveJobseekerMatchingPreferences, serializeJson);
  const resumeSave = useAutosave(resume, async (value) => {
    const saved = await saveJobseekerResume({ ...value, revision: revision.current });
    revision.current = saved.revision;
  }, serializeResume);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    Promise.all([getProfile(), getJobseekerMatchingPreferences(), getJobseekerResume()])
      .then(([loadedProfile, loadedPreferences, loadedResume]) => {
        if (!active) return;
        const nextProfile = loadedProfile ?? blankProfile(session.userId, session.email, session.fullName);
        // A missing profile row is created on the first real edit, not on page open.
        profileSave.markSaved(loadedProfile ?? nextProfile);
        preferencesSave.markSaved(loadedPreferences);
        resumeSave.markSaved(loadedResume);
        revision.current = loadedResume.revision;
        setProfile(nextProfile);
        setPreferences(loadedPreferences ?? { ...emptyJobseekerMatchingPreferences });
        setResume(loadedResume);
      })
      .catch((err) => { if (active) setLoadError(errorMessage(err, '履歴書の情報を読み込めませんでした。')); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, session.userId]);

  const goTo = (index: number) => {
    setStepIndex(Math.max(0, Math.min(steps.length - 1, index)));
    window.scrollTo({ top: 0 });
    window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 0);
  };

  if (loadError) return <InlineError message={loadError} onRetry={() => setAttempt((value) => value + 1)} />;
  if (!profile || !preferences || !resume) return <SkeletonList rows={3} />;

  const step = steps[stepIndex];
  const states = [profileSave.state, preferencesSave.state, resumeSave.state];
  const saveState: SaveState = states.includes('conflict') ? 'conflict'
    : states.includes('error') ? 'error'
      : states.includes('saving') ? 'saving'
        : states.includes('saved') ? 'saved' : 'idle';
  const saveError = resumeSave.error || profileSave.error || preferencesSave.error;
  const updateResume = (patch: Partial<JobseekerResume>) => setResume((current) => (current ? { ...current, ...patch } : current));
  const updateProfile = (patch: Partial<JobseekerProfile>) => setProfile((current) => (current ? { ...current, ...patch } : current));
  const flushAll = async () => (await Promise.all([profileSave.flush(), preferencesSave.flush(), resumeSave.flush()])).every(Boolean);

  const source: ResumeSourceData = {
    profile,
    resume,
    classroomExperience: preferences.classroom_experience,
    leadershipRoles: preferences.leadership_roles,
    createdOn: new Date(),
  };

  return (
    <div className="hc-view rb">
      <div className="rb-top">
        <p className="hc-lead">質問に答えるだけで、履歴書と職務経歴書（A4・PDF）が作れます。入力内容は自動で保存され、あとから何度でも直せます。</p>
        <div className="rb-progress" aria-hidden="true"><span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
        <nav className="rb-steps" aria-label="入力ステップ">
          {steps.map((item, index) => (
            <button key={item.key} type="button" className={index === stepIndex ? 'is-current' : ''} aria-current={index === stepIndex ? 'step' : undefined} onClick={() => goTo(index)}>
              <span>{index + 1}</span>{item.label}
            </button>
          ))}
        </nav>
        <SaveStatus state={saveState} error={saveError} onRetry={() => { void flushAll(); }} />
      </div>

      <section className="hc-form-section rb-step" aria-labelledby="rb-step-heading">
        <p className="rb-step-count">ステップ {stepIndex + 1} / {steps.length}</p>
        <h2 id="rb-step-heading" ref={headingRef} tabIndex={-1}>{step.question}</h2>
        <StepBody
          step={step.key}
          profile={profile}
          preferences={preferences}
          resume={resume}
          source={source}
          updateProfile={updateProfile}
          updatePreferences={(patch) => setPreferences((current) => (current ? { ...current, ...patch } : current))}
          updateResume={updateResume}
          flushAll={flushAll}
          ownerId={session.userId}
        />
      </section>

      <div className="rb-nav">
        <button type="button" className="secondary-button" disabled={stepIndex === 0} onClick={() => goTo(stepIndex - 1)}>戻る</button>
        {stepIndex < steps.length - 1
          ? <button type="button" className="primary-button" onClick={() => goTo(stepIndex + 1)}>次へ<Icon name="chevron" size={16} /></button>
          : <a className="secondary-button" href="/profile#document-vault-heading">保存した書類を見る</a>}
      </div>
      {stepIndex < steps.length - 1 && <p className="hc-note rb-skip-note">わからない項目は空欄のまま「次へ」で進めます。あとから戻って入力できます。</p>}
    </div>
  );
}

function SaveStatus({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  if (state === 'conflict') {
    return <p className="rb-save is-error" role="alert">{error} <button type="button" className="rb-link" onClick={() => window.location.reload()}>読み込み直す</button></p>;
  }
  if (state === 'error') {
    return <p className="rb-save is-error" role="alert">{error || '自動保存できませんでした。'} <button type="button" className="rb-link" onClick={onRetry}>もう一度保存</button></p>;
  }
  return <p className="rb-save" role="status" aria-live="polite">{state === 'saving' ? '保存しています…' : state === 'saved' ? '✓ 自動保存しました' : '入力すると自動で保存されます'}</p>;
}

type StepProps = {
  step: StepKey;
  profile: JobseekerProfile;
  preferences: JobseekerMatchingPreferences;
  resume: JobseekerResume;
  source: ResumeSourceData;
  updateProfile: (patch: Partial<JobseekerProfile>) => void;
  updatePreferences: (patch: Partial<JobseekerMatchingPreferences>) => void;
  updateResume: (patch: Partial<JobseekerResume>) => void;
  flushAll: () => Promise<boolean>;
  ownerId: string;
};

function StepBody(props: StepProps) {
  switch (props.step) {
    case 'basic': return <BasicStep {...props} />;
    case 'education': return <EducationStep {...props} />;
    case 'employment': return <EmploymentStep {...props} />;
    case 'licenses': return <LicensesStep {...props} />;
    case 'childcare': return <ChildcareStep {...props} />;
    case 'writing': return <WritingStep {...props} />;
    case 'finish': return <FinishStep {...props} />;
  }
}

/* ------------------------------- Fields ------------------------------- */

function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="rb-field">
      <label className="hc-field">
        <span>{label}{optional && <em className="rb-optional" aria-hidden="true">任意</em>}</span>
        {children}
      </label>
      {hint && <small className="rb-hint">{hint}</small>}
    </div>
  );
}

function TextArea({ label, hint, value, max, rows = 5, placeholder, onChange, optional }: {
  label: string; hint?: string; value: string | null; max: number; rows?: number; placeholder?: string; optional?: boolean; onChange: (value: string | null) => void;
}) {
  const length = value?.length ?? 0;
  return (
    <div className="rb-field">
      <Field label={label} hint={hint} optional={optional}>
        <textarea rows={rows} maxLength={max} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value || null)} />
      </Field>
      <small className={`rb-count ${length > max * 0.9 ? 'is-near' : ''}`} aria-live="polite">{length} / {max}文字</small>
    </div>
  );
}

const thisYear = new Date().getFullYear();
const years = Array.from({ length: thisYear + 6 - 1950 + 1 }, (_, index) => String(thisYear + 6 - index));
const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));

function YearMonth({ label, value, onChange, disabled }: { label: string; value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const [year, month] = value ? value.split('-') : ['', ''];
  const [draftYear, setDraftYear] = useState(year);
  const [draftMonth, setDraftMonth] = useState(month);
  useEffect(() => { setDraftYear(year); setDraftMonth(month); }, [year, month]);
  const commit = (nextYear: string, nextMonth: string) => {
    setDraftYear(nextYear); setDraftMonth(nextMonth);
    if (nextYear && nextMonth) onChange(`${nextYear}-${nextMonth}`);
    else if (!nextYear && !nextMonth) onChange(null);
  };
  return (
    <fieldset className="rb-ym" disabled={disabled}>
      <legend>{label}</legend>
      <select aria-label={`${label}（年）`} value={draftYear} onChange={(e) => commit(e.target.value, draftMonth)}>
        <option value="">年</option>
        {years.map((item) => <option key={item} value={item}>{item}年</option>)}
      </select>
      <select aria-label={`${label}（月）`} value={draftMonth} onChange={(e) => commit(draftYear, e.target.value)}>
        <option value="">月</option>
        {months.map((item) => <option key={item} value={item}>{Number(item)}月</option>)}
      </select>
    </fieldset>
  );
}

function Chips({ options, values, onChange, label }: { options: string[]; values: string[]; onChange: (values: string[]) => void; label: string }) {
  const all = [...new Set([...options, ...values])];
  return (
    <fieldset className="hc-chip-group">
      <legend>{label}</legend>
      <div>{all.map((option) => (
        <button key={option} type="button" className={`hc-chip ${values.includes(option) ? 'is-active' : ''}`} aria-pressed={values.includes(option)}
          onClick={() => onChange(values.includes(option) ? values.filter((item) => item !== option) : [...values, option])}>{option}</button>
      ))}</div>
    </fieldset>
  );
}

function SelectField({ label, value, options, onChange, optional }: { label: string; value: string | null; options: readonly string[]; optional?: boolean; onChange: (value: string | null) => void }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Field label={label} optional={optional}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">選択してください</option>
        {all.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </Field>
  );
}

/* -------------------------------- Steps -------------------------------- */

function BasicStep({ profile, resume, updateProfile, updateResume }: StepProps) {
  return <>
    <p className="hc-note">お名前・連絡先はマイページのプロフィールと同じ内容です。ここで直すと、プロフィールにも反映されます。</p>
    <Field label="お名前"><input value={profile.name ?? ''} autoComplete="name" onChange={(e) => updateProfile({ name: e.target.value || null })} placeholder="保育 花子" /></Field>
    <Field label="ふりがな"><input value={profile.name_kana ?? ''} onChange={(e) => updateProfile({ name_kana: e.target.value || null })} placeholder="ほいく はなこ" /></Field>
    <Field label="生年月日"><input type="date" value={resume.birth_date ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => updateResume({ birth_date: e.target.value || null })} /></Field>
    <Field label="性別" optional hint="書かなくても問題ありません。"><input value={resume.gender ?? ''} maxLength={20} onChange={(e) => updateResume({ gender: e.target.value || null })} /></Field>
    <Field label="郵便番号" hint="例：150-0001"><input inputMode="numeric" autoComplete="postal-code" maxLength={8} value={resume.postal_code ?? ''} onChange={(e) => updateResume({ postal_code: e.target.value.replace(/[^0-9-]/g, '') || null })} /></Field>
    <Field label="住所" hint="都道府県から、建物名・部屋番号まで"><input autoComplete="street-address" maxLength={200} value={resume.address ?? ''} onChange={(e) => updateResume({ address: e.target.value || null })} /></Field>
    <Field label="住所のふりがな" optional><input maxLength={200} value={resume.address_kana ?? ''} onChange={(e) => updateResume({ address_kana: e.target.value || null })} /></Field>
    <Field label="電話番号"><input type="tel" inputMode="tel" autoComplete="tel" value={profile.phone ?? ''} onChange={(e) => updateProfile({ phone: e.target.value || null })} /></Field>
    <Field label="メールアドレス"><input type="email" inputMode="email" autoComplete="email" value={profile.email ?? ''} onChange={(e) => updateProfile({ email: e.target.value || null })} /></Field>
    <Field label="現住所以外の連絡先" optional hint="実家など、別の連絡先を希望する場合だけ"><input maxLength={200} value={resume.contact_address ?? ''} onChange={(e) => updateResume({ contact_address: e.target.value || null })} /></Field>
  </>;
}

function EntryShell({ title, index, count, onMove, onRemove, children }: { title: string; index: number; count: number; onMove: (delta: number) => void; onRemove: () => void; children: ReactNode }) {
  return (
    <article className="rb-entry">
      <header>
        <strong>{title}</strong>
        <div>
          <button type="button" className="rb-icon-button" aria-label="上へ移動" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="rb-icon-button" aria-label="下へ移動" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" className="rb-link" onClick={onRemove}>削除</button>
        </div>
      </header>
      {children}
    </article>
  );
}

function moveItem<T>(items: T[], index: number, delta: number) {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return items;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function EducationStep({ resume, updateResume }: StepProps) {
  const items = resume.education;
  const update = (index: number, patch: Partial<ResumeEducation>) => updateResume({ education: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return <>
    <p className="hc-note">高校から書くのが一般的です。学校名は「〇〇県立」「〇〇大学 〇〇学部」など正式な名前で書きましょう。</p>
    {items.map((item, index) => (
      <EntryShell key={item.id} title={item.organization || `学校 ${index + 1}`} index={index} count={items.length}
        onMove={(delta) => updateResume({ education: moveItem(items, index, delta) })}
        onRemove={() => { if (window.confirm('この学歴を削除しますか？')) updateResume({ education: items.filter((_, i) => i !== index) }); }}>
        <Field label="学校名"><input maxLength={200} value={item.organization} onChange={(e) => update(index, { organization: e.target.value })} placeholder="〇〇県立〇〇高等学校" /></Field>
        <Field label="学部・学科" optional><input maxLength={200} value={item.department ?? ''} onChange={(e) => update(index, { department: e.target.value || null })} placeholder="普通科／教育学部 子ども学科" /></Field>
        <YearMonth label="入学した年月" value={item.start_ym} onChange={(value) => update(index, { start_ym: value })} />
        <YearMonth label="卒業した年月" value={item.end_ym} disabled={item.education_status === '在学中'} onChange={(value) => update(index, { end_ym: value })} />
        <SelectField label="卒業の状態" value={item.education_status} options={educationStatuses} onChange={(value) => update(index, { education_status: value as ResumeEducation['education_status'], is_current: value === '在学中' })} />
      </EntryShell>
    ))}
    {items.length < resumeLimits.education
      ? <button type="button" className="secondary-button rb-add" onClick={() => updateResume({ education: [...items, newEducation()] })}>＋ 学校を追加</button>
      : <p className="hc-note">学歴は{resumeLimits.education}件まで追加できます。</p>}
  </>;
}

function EmploymentStep({ resume, updateResume }: StepProps) {
  const items = resume.employment;
  const update = (index: number, patch: Partial<ResumeEmployment>) => updateResume({ employment: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return <>
    <p className="hc-note">はじめての就職なら、何も追加せずに「次へ」で大丈夫です（職歴は「なし」と表示されます）。アルバイトや保育以外の仕事も書けます。</p>
    {items.map((item, index) => (
      <EntryShell key={item.id} title={item.organization || `職場 ${index + 1}`} index={index} count={items.length}
        onMove={(delta) => updateResume({ employment: moveItem(items, index, delta) })}
        onRemove={() => { if (window.confirm('この職歴を削除しますか？')) updateResume({ employment: items.filter((_, i) => i !== index) }); }}>
        <Field label="園・会社の名前"><input maxLength={200} value={item.organization} onChange={(e) => update(index, { organization: e.target.value })} placeholder="社会福祉法人〇〇会 〇〇保育園" /></Field>
        <SelectField label="施設の種類" optional value={item.facility_type} options={facilityTypeOptions} onChange={(value) => update(index, { facility_type: value })} />
        <SelectField label="雇用形態" optional value={item.employment_type} options={employmentTypeOptions} onChange={(value) => update(index, { employment_type: value })} />
        <Field label="職種・役職" optional><input maxLength={100} value={item.job_title ?? ''} onChange={(e) => update(index, { job_title: e.target.value || null })} placeholder="保育士" /></Field>
        <YearMonth label="働き始めた年月" value={item.start_ym} onChange={(value) => update(index, { start_ym: value })} />
        <label className="rb-check"><input type="checkbox" checked={item.is_current} onChange={(e) => update(index, { is_current: e.target.checked, end_ym: e.target.checked ? null : item.end_ym })} />今もここで働いている</label>
        {!item.is_current && <>
          <YearMonth label="辞めた年月" value={item.end_ym} onChange={(value) => update(index, { end_ym: value })} />
          <SelectField label="退職の理由（書き方）" optional value={item.leaving_reason} options={leavingReasonOptions} onChange={(value) => update(index, { leaving_reason: value })} />
        </>}
        <Chips label="担当した年齢" options={ageGroupOptions} values={item.age_groups} onChange={(value) => update(index, { age_groups: value })} />
        <label className="rb-check"><input type="checkbox" checked={item.class_lead} onChange={(e) => update(index, { class_lead: e.target.checked })} />クラス担任をした</label>
        <Field label="リーダー・役職の経験" optional><input maxLength={100} value={item.management_role ?? ''} onChange={(e) => update(index, { management_role: e.target.value || null })} placeholder="乳児リーダー、主任 など" /></Field>
        <Field label="園の規模" optional><input maxLength={50} value={item.children_count ?? ''} onChange={(e) => update(index, { children_count: e.target.value || null })} placeholder="定員90名、職員20名 など" /></Field>
        <TextArea label="どんな仕事をしましたか？" optional max={resumeLimits.duties} rows={4} value={item.duties} onChange={(value) => update(index, { duties: value })} placeholder="例：1歳児クラスの担任（園児12名・保育士3名）。連絡帳、指導計画の作成。" />
        <TextArea label="工夫したこと・できるようになったこと" optional max={resumeLimits.achievements} rows={4} value={item.achievements} onChange={(value) => update(index, { achievements: value })} />
      </EntryShell>
    ))}
    {items.length < resumeLimits.employment
      ? <button type="button" className="secondary-button rb-add" onClick={() => updateResume({ employment: [...items, newEmployment()] })}>＋ 職場を追加</button>
      : <p className="hc-note">職歴は{resumeLimits.employment}件まで追加できます。</p>}
  </>;
}

function LicensesStep({ profile, resume, updateProfile, updateResume }: StepProps) {
  const [custom, setCustom] = useState('');
  const setAcquired = (name: string, value: string | null) => {
    const next = { ...resume.qualification_acquired };
    if (value) next[name] = value; else delete next[name];
    updateResume({ qualification_acquired: next });
  };
  const toggle = (values: string[]) => {
    updateProfile({ qualifications: values });
    const kept = Object.fromEntries(Object.entries(resume.qualification_acquired).filter(([name]) => values.includes(name)));
    if (Object.keys(kept).length !== Object.keys(resume.qualification_acquired).length) updateResume({ qualification_acquired: kept });
  };
  const addCustom = () => {
    const name = custom.trim().slice(0, 100);
    if (!name || profile.qualifications.includes(name) || profile.qualifications.length >= 50) return;
    toggle([...profile.qualifications, name]);
    setCustom('');
  };
  return <>
    <p className="hc-note">選んだ資格はプロフィールにも保存され、求人のマッチングにも使われます。持っていない資格は書かないでください。</p>
    <Chips label="持っている資格・免許" options={qualificationOptions} values={profile.qualifications} onChange={toggle} />
    <div className="rb-inline">
      <Field label="ほかの資格を追加" optional><input value={custom} maxLength={100} onChange={(e) => setCustom(e.target.value)} placeholder="例：リトミック指導員" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} /></Field>
      <button type="button" className="secondary-button" disabled={!custom.trim()} onClick={addCustom}>追加</button>
    </div>
    {profile.qualifications.map((name) => (
      <YearMonth key={name} label={`${name}を取得した年月`} value={resume.qualification_acquired[name] ?? null} onChange={(value) => setAcquired(name, value)} />
    ))}
  </>;
}

function ChildcareStep({ profile, preferences, updateProfile, updatePreferences }: StepProps) {
  return <>
    <p className="hc-note">ここで選んだ内容はプロフィールの「詳しい希望条件」と同じです。職務経歴書の「保育の経験」に載ります。</p>
    <Field label="保育の経験は何年ですか？" hint="0.5年単位で入力できます。経験がなければ空欄のままで大丈夫です。">
      <input type="number" inputMode="decimal" min="0" max="80" step="0.5" value={profile.years_of_experience ?? ''} onChange={(e) => updateProfile({ years_of_experience: e.target.value === '' ? null : Math.max(0, Math.min(80, Number(e.target.value))) })} />
    </Field>
    <Chips label="担当したことがある年齢・クラス" options={classroomOptions} values={preferences.classroom_experience} onChange={(value) => updatePreferences({ classroom_experience: value })} />
    <Chips label="リーダー・管理職の経験" options={leadershipOptions} values={preferences.leadership_roles} onChange={(value) => updatePreferences({ leadership_roles: value })} />
  </>;
}

/**
 * Optional draft for one writing field. The draft is built only from what the candidate
 * already saved, is shown for review, and is applied only when they press「この下書きを使う」.
 */
function WritingAssist({ field, label, current, flushAll, onAccept }: {
  field: WritingAssistField; label: string; current: string | null; flushAll: () => Promise<boolean>; onAccept: (draft: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (busy) return;
    setBusy(true); setError(null); setDraft(null);
    try {
      if (!(await flushAll())) throw new Error('入力内容を保存できませんでした。通信状況を確認して、もう一度お試しください。');
      setDraft(await requestWritingDraft(field));
    } catch (err) {
      setError(errorMessage(err, '下書きを作れませんでした。時間をおいてお試しください。'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rb-assist">
      {!draft && (
        <button type="button" className="secondary-button rb-assist-button" onClick={() => { void create(); }} disabled={busy} aria-busy={busy}>
          <Icon name="sparkles" size={18} />{busy ? '下書きを作成中…' : `${label}の下書きを作る`}
        </button>
      )}
      {error && <p className="rb-assist-error" role="alert">{error}</p>}
      {draft && (
        <section className="rb-assist-draft" aria-label={`${label}の下書き`}>
          <p className="rb-assist-title">下書き（まだ反映されていません）</p>
          <p className="rb-assist-text">{draft}</p>
          <p className="rb-hint">内容が事実と合っているか必ず確認してください。{current ? 'このボタンを押すと、いま書いてある文章と置き換わります。' : ''}使ったあとも自由に書き直せます。</p>
          <div className="rb-assist-actions">
            <button type="button" className="primary-button" onClick={() => { onAccept(draft); setDraft(null); }}>この下書きを使う</button>
            <button type="button" className="secondary-button" onClick={() => setDraft(null)}>使わない</button>
          </div>
        </section>
      )}
    </div>
  );
}

function WritingStep({ profile, resume, updateResume, flushAll }: StepProps) {
  const assist = (field: WritingAssistField, label: string) => (
    <WritingAssist field={field} label={label} current={resume[field]} flushAll={flushAll}
      onAccept={(draft) => updateResume({ [field]: draft.slice(0, resumeLimits[field]) })} />
  );
  return <>
    <p className="hc-note">うまく書けなくても大丈夫です。下の質問に、思いつくことを短く書くだけで伝わります。本当にあった経験だけを書きましょう。</p>
    <p className="hc-note rb-assist-note">各欄の「下書きを作る」を押すと、これまでに入力した資格・職歴・保育経験だけを使って、AIが文章の下書きを作ります。下書きは確認してから使うかどうか選べます。作成のため、入力内容を外部のAIサービスに送ります（氏名・連絡先・住所・生年月日・学歴は送らず、勤務先欄の名前は記号に置き換えます）。</p>
    <TextArea label="職務要約（これまでの仕事を2〜3行で）" optional max={resumeLimits.work_summary} rows={4} value={resume.work_summary} onChange={(value) => updateResume({ work_summary: value })}
      hint="何年、どんな園で、どの年齢を担当したか。職務経歴書のいちばん上に載ります。" />
    {assist('work_summary', '職務要約')}
    <TextArea label="得意なこと・強み" optional max={resumeLimits.strengths} rows={3} value={resume.strengths} onChange={(value) => updateResume({ strengths: value })}
      hint="ピアノ、製作、運動遊び、保護者対応、記録の工夫など" />
    {assist('strengths', '得意なこと・強み')}
    <TextArea label="自己PR" optional max={resumeLimits.self_pr} rows={6} value={resume.self_pr} onChange={(value) => updateResume({ self_pr: value })}
      hint="保育で大切にしていること、それが表れた具体的な場面を1つ" />
    {!resume.self_pr && profile.self_intro && (
      <button type="button" className="secondary-button rb-add" onClick={() => updateResume({ self_pr: profile.self_intro!.slice(0, resumeLimits.self_pr) })}>プロフィールの自己紹介を自己PRに使う</button>
    )}
    {assist('self_pr', '自己PR')}
    <TextArea label="志望動機" optional max={resumeLimits.motivation} rows={5} value={resume.motivation} onChange={(value) => updateResume({ motivation: value })}
      hint="園ごとに変える場合は、応募前にここを書き換えてPDFを作り直せます。" />
    {assist('motivation', '志望動機')}
    <TextArea label="本人希望記入欄" optional max={resumeLimits.personal_requests} rows={3} value={resume.personal_requests} onChange={(value) => updateResume({ personal_requests: value })}
      hint="空欄なら「貴園の規定に従います。」と入ります。勤務時間などの条件があれば書きましょう。" />
  </>;
}

/* -------------------------------- Finish -------------------------------- */

type Created = { type: JobseekerDocumentType; url: string; fileName: string; missing: string[] };

function FinishStep({ source, ownerId, flushAll }: StepProps) {
  const [tab, setTab] = useState<'resume' | 'work_history'>('resume');
  const [makeDefault, setMakeDefault] = useState(true);
  const [busy, setBusy] = useState<JobseekerDocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created[]>([]);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const gaps = resumeGaps(source);
  const resumeModel = buildResumeModel(source);
  const workModel = buildWorkHistoryModel(source);

  useEffect(() => {
    let active = true;
    void loadResumePhoto(ownerId).then((blob) => { if (active) setPhoto(blob); });
    return () => { active = false; };
  }, [ownerId]);

  useEffect(() => {
    if (!photo) { setPhotoUrl(null); return; }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const createdUrls = useRef<string[]>([]);
  useEffect(() => () => createdUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareResumePhoto(file);
      await saveResumePhoto(ownerId, prepared);
      setPhoto(prepared);
    } catch (err) {
      setError(errorMessage(err, '写真を読み込めませんでした。'));
    } finally {
      if (photoInput.current) photoInput.current.value = '';
    }
  };

  const removePhoto = async () => {
    await deleteResumePhoto(ownerId);
    setPhoto(null);
  };

  const create = async (type: 'resume' | 'work_history') => {
    if (busy) return;
    if (!source.profile.name?.trim()) { setError('お名前を入力してから作成してください（ステップ1）。'); return; }
    setBusy(type); setError(null);
    try {
      if (!(await flushAll())) throw new Error('入力内容を保存できませんでした。通信状況を確認して、もう一度お試しください。');
      const { renderResumePdf, renderWorkHistoryPdf } = await import('../lib/resumePdf');
      const result = type === 'resume'
        ? await renderResumePdf(buildResumeModel(source), photo ? { bytes: await photo.arrayBuffer(), type: 'image/jpeg' } : null)
        : await renderWorkHistoryPdf(buildWorkHistoryModel(source));
      const label = type === 'resume' ? '履歴書' : '職務経歴書';
      const stamp = new Date();
      const ymd = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`;
      const fileName = `${label}_${ymd}.pdf`;
      const file = new File([result.bytes as BlobPart], fileName, { type: 'application/pdf' });
      await uploadJobseekerDocument(ownerId, type, file, {
        title: `${label}（${stamp.getFullYear()}年${stamp.getMonth() + 1}月${stamp.getDate()}日 作成）`,
        makeDefault,
      });
      const url = URL.createObjectURL(file);
      createdUrls.current.push(url);
      setCreated((current) => [...current.filter((item) => item.type !== type), { type, url, fileName, missing: result.missingCharacters }]);
    } catch (err) {
      setError(errorMessage(err, 'PDFを作成できませんでした。もう一度お試しください。'));
    } finally {
      setBusy(null);
    }
  };

  const createdResume = created.find((item) => item.type === 'resume');
  const createdWork = created.find((item) => item.type === 'work_history');

  return <>
    {gaps.length > 0 && (
      <div className="rb-gaps" role="note">
        <strong>まだ入力していない項目</strong>
        <p>{gaps.join('、')}。空欄のままでも作成できますが、書いておくと園に伝わりやすくなります。</p>
      </div>
    )}

    <div className="rb-tabs" role="tablist" aria-label="プレビュー">
      <button type="button" role="tab" aria-selected={tab === 'resume'} className={tab === 'resume' ? 'is-active' : ''} onClick={() => setTab('resume')}>履歴書</button>
      <button type="button" role="tab" aria-selected={tab === 'work_history'} className={tab === 'work_history' ? 'is-active' : ''} onClick={() => setTab('work_history')}>職務経歴書</button>
    </div>
    <div role="tabpanel" aria-label={tab === 'resume' ? '履歴書のプレビュー' : '職務経歴書のプレビュー'}>
      {tab === 'resume' ? <ResumePreview model={resumeModel} photoUrl={photoUrl} /> : <WorkHistoryPreview model={workModel} />}
    </div>

    <div className="rb-photo">
      <strong>証明写真（任意）</strong>
      <p className="hc-note">写真はこの端末の中だけに保存され、作成した履歴書PDFにだけ入ります。写真だけが送信・公開されることはありません。</p>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
      <div className="rb-photo-actions">
        <button type="button" className="secondary-button" onClick={() => photoInput.current?.click()}>{photo ? '写真を変える' : '写真を選ぶ'}</button>
        {photo && <button type="button" className="rb-link" onClick={() => void removePhoto()}>写真を外す</button>}
      </div>
    </div>

    <label className="rb-check"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />作成したPDFを「応募時に使う書類」にする（次の応募から自動で提出されます）</label>

    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="rb-create">
      <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void create('resume')}>
        {busy === 'resume' ? '作成しています…' : '履歴書のPDFを作成して保存'}
      </button>
      <button type="button" className="primary-button" disabled={busy !== null} onClick={() => void create('work_history')}>
        {busy === 'work_history' ? '作成しています…' : '職務経歴書のPDFを作成して保存'}
      </button>
    </div>
    {[createdResume, createdWork].filter((item): item is Created => Boolean(item)).map((item) => (
      <div key={item.type} className="rb-created" role="status">
        <strong>{item.type === 'resume' ? '履歴書' : '職務経歴書'}を書類に保存しました</strong>
        <p>マイページの「応募書類」に入っています。{makeDefault ? '次の応募から自動で提出されます。' : ''}応募済みの園には、応募の詳細画面から提出できます。</p>
        {item.missing.length > 0 && <p className="form-error">PDFで表示できない文字があったため「〓」に置き換えました：{item.missing.join(' ')}　常用の字（例：髙→高）に直すか、手書きで補ってください。</p>}
        <a className="secondary-button" href={item.url} download={item.fileName}>PDFをダウンロード</a>
      </div>
    ))}
    <p className="hc-note">内容を直したら、もう一度「作成して保存」を押すと新しいPDFができます。以前のPDFも書類に残るので、不要なら削除できます。</p>
  </>;
}

/* ------------------------------- Previews ------------------------------- */

function ResumePreview({ model, photoUrl }: { model: ResumeModel; photoUrl: string | null }) {
  return (
    <article className="rb-paper" aria-label="履歴書">
      <header className="rb-paper-head"><h3>履歴書</h3><span>{model.createdOn}</span></header>
      <div className="rb-paper-personal">
        <dl>
          <div><dt>ふりがな</dt><dd>{model.nameKana || '—'}</dd></div>
          <div><dt>氏名</dt><dd className="rb-paper-name">{model.name || '（未入力）'}</dd></div>
          <div><dt>生年月日</dt><dd>{model.birthLine || '—'}</dd></div>
          {model.gender && <div><dt>性別</dt><dd>{model.gender}</dd></div>}
          <div><dt>現住所</dt><dd>{model.postalCode && <>〒{model.postalCode}<br /></>}{model.address || '—'}{model.addressKana && <small>{model.addressKana}</small>}</dd></div>
          <div><dt>電話</dt><dd>{model.phone || '—'}</dd></div>
          <div><dt>E-mail</dt><dd className="rb-break">{model.email || '—'}</dd></div>
          {model.contactAddress && <div><dt>連絡先</dt><dd>{model.contactAddress}</dd></div>}
        </dl>
        <div className="rb-paper-photo">{photoUrl ? <img src={photoUrl} alt="証明写真" /> : <span>写真</span>}</div>
      </div>
      <HistoryTable title="学歴・職歴" rows={model.history} />
      <HistoryTable title="免許・資格" rows={model.licenses.length ? model.licenses : [{ year: '', month: '', text: '特になし' }]} />
      <section className="rb-paper-box">
        <h4>志望の動機、自己PR、得意なことなど</h4>
        {model.appeal.length ? model.appeal.map((item) => <div key={item.heading}><strong>【{item.heading}】</strong><p>{item.body}</p></div>) : <p className="rb-muted">（未入力）</p>}
      </section>
      <section className="rb-paper-box">
        <h4>本人希望記入欄</h4>
        <p>{model.requests}</p>
      </section>
    </article>
  );
}

function HistoryTable({ title, rows }: { title: string; rows: ResumeModel['history'] }) {
  return (
    <table className="rb-paper-table">
      <thead><tr><th scope="col">年</th><th scope="col">月</th><th scope="col">{title}</th></tr></thead>
      <tbody>{rows.map((row, index) => (
        <tr key={index}><td>{row.year}</td><td>{row.month}</td><td className={row.align ? `is-${row.align}` : ''}>{row.text}</td></tr>
      ))}</tbody>
    </table>
  );
}

function WorkHistoryPreview({ model }: { model: WorkHistoryModel }) {
  return (
    <article className="rb-paper" aria-label="職務経歴書">
      <header className="rb-paper-head is-center"><h3>職務経歴書</h3></header>
      <p className="rb-paper-meta">{model.createdOn}<br />氏名　{model.name || '（未入力）'}</p>
      {model.sections.length === 0 && <p className="rb-muted">職歴や自己PRを入力すると、ここに表示されます。</p>}
      {model.sections.map((section) => (
        <section key={section.title} className="rb-paper-section">
          <h4>■ {section.title}</h4>
          {section.kind === 'paragraph' && <p>{section.text}</p>}
          {section.kind === 'facts' && <dl className="rb-facts">{section.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
          {section.kind === 'list' && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          {section.kind === 'jobs' && section.jobs.map((job, index) => (
            <div key={index} className="rb-job">
              <div className="rb-job-head">{job.period && <small>{job.period}</small>}<strong>{job.organization}</strong>{job.subtitle && <small>{job.subtitle}</small>}</div>
              {job.facts.length > 0 && <dl className="rb-facts">{job.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
              {job.paragraphs.map((item) => <div key={item.label}><strong className="rb-muted">【{item.label}】</strong><p>{item.text}</p></div>)}
            </div>
          ))}
        </section>
      ))}
      <p className="rb-paper-end">以上</p>
    </article>
  );
}
