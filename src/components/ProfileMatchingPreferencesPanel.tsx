import { useUser } from '@clerk/react';
import { useEffect, useMemo, useState } from 'react';
import {
  emptyJobseekerMatchingPreferences,
  getJobseekerMatchingPreferences,
  saveJobseekerMatchingPreferences,
  type JobseekerMatchingPreferences,
} from '../lib/profilePreferencesRepository';
import './ProfileMatchingPreferencesPanel.css';

const weekdays = ['月', '火', '水', '木', '金', '土', '日'];
const classroomOptions = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', 'フリー', '異年齢保育', '障害児保育'];
const leadershipOptions = ['乳児リーダー', '幼児リーダー', '副主任', '主任', '園長', '施設長'];
const childAgeOptions = ['0歳児', '1歳児', '2歳児', '3歳児', '4歳児', '5歳児', '異年齢'];
const childcareValueOptions = ['子ども主体', '自由保育', '遊び中心', '外遊び重視', '一斉保育', '教育・学習', '異年齢保育', '少人数保育', '行事重視', '行事は最小限', 'チーム保育', '個別支援', 'インクルーシブ保育'];
const workPreferenceOptions = ['残業少なめ', '持ち帰りなし', '有休を取りやすい', '土曜勤務少なめ', '早番少なめ', '遅番少なめ', 'ICT活用', '研修充実', '子育てと両立', '配置に余裕', '見学して決めたい', '体験して決めたい'];

function csv(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function ToggleGroup({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (next: string[]) => void }) {
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  return <div className="profile-chip-grid">{options.map((option) => <button key={option} type="button" className={`profile-chip ${selected.includes(option) ? 'is-selected' : ''}`} aria-pressed={selected.includes(option)} onClick={() => toggle(option)}>{option}</button>)}</div>;
}

export function ProfileMatchingPreferencesPanel() {
  const { user } = useUser();
  const [draft, setDraft] = useState<JobseekerMatchingPreferences>(emptyJobseekerMatchingPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getJobseekerMatchingPreferences()
      .then((value) => { if (active) setDraft(value); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : '希望条件を読み込めませんでした。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const completion = useMemo(() => {
    const checks = [
      draft.desired_prefectures.length > 0,
      draft.desired_monthly_salary_min !== null || draft.desired_hourly_wage_min !== null,
      draft.available_weekdays.length > 0,
      draft.classroom_experience.length > 0,
      draft.childcare_values.length > 0,
      draft.work_preferences.length > 0,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft]);

  const update = <K extends keyof JobseekerMatchingPreferences>(key: K, value: JobseekerMatchingPreferences[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!user?.id || saving) return;
    if (draft.available_time_from && draft.available_time_to && draft.available_time_from >= draft.available_time_to) {
      setError('勤務可能時間は、開始時刻を終了時刻より前にしてください。');
      return;
    }
    setSaving(true); setError(null); setNotice(null);
    try {
      await saveJobseekerMatchingPreferences(user.id, draft);
      setNotice('希望条件と保育観を保存しました。匿名スカウトやマッチング精度の向上に利用されます。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '希望条件を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="form-section"><div className="form-section-head"><h3>詳しい希望条件・保育観</h3><p>読み込み中です。</p></div></section>;

  return <section className="form-section profile-matching-panel" aria-labelledby="profile-matching-heading">
    <div className="form-section-head profile-matching-head">
      <div><h3 id="profile-matching-heading">詳しい希望条件・保育観</h3><p>求人の絞り込み、保育観マッチング、匿名スカウトの精度向上に使います。氏名・連絡先・現在勤務先は匿名スカウトには含まれません。</p></div>
      <span className="profile-completion">入力度 {completion}%</span>
    </div>

    <div className="profile-preference-block">
      <strong>希望エリア・給与</strong>
      <div className="profile-preference-grid">
        <label>希望都道府県<input value={draft.desired_prefectures.join(', ')} onChange={(e) => update('desired_prefectures', csv(e.target.value))} placeholder="東京都, 神奈川県" /></label>
        <label>希望市区町村<input value={draft.desired_cities.join(', ')} onChange={(e) => update('desired_cities', csv(e.target.value))} placeholder="世田谷区, 川崎市" /></label>
        <label>希望月給の下限<input type="number" min="0" step="1000" value={draft.desired_monthly_salary_min ?? ''} onChange={(e) => update('desired_monthly_salary_min', e.target.value ? Number(e.target.value) : null)} placeholder="250000" /></label>
        <label>希望時給の下限<input type="number" min="0" step="10" value={draft.desired_hourly_wage_min ?? ''} onChange={(e) => update('desired_hourly_wage_min', e.target.value ? Number(e.target.value) : null)} placeholder="1300" /></label>
        <label>通勤時間の上限（分）<input type="number" min="1" max="300" value={draft.max_commute_minutes ?? ''} onChange={(e) => update('max_commute_minutes', e.target.value ? Number(e.target.value) : null)} placeholder="45" /></label>
      </div>
    </div>

    <div className="profile-preference-block"><strong>勤務できる曜日</strong><ToggleGroup options={weekdays} selected={draft.available_weekdays} onChange={(value) => update('available_weekdays', value)} /><div className="profile-time-grid"><label>開始<input type="time" value={draft.available_time_from || ''} onChange={(e) => update('available_time_from', e.target.value || null)} /></label><label>終了<input type="time" value={draft.available_time_to || ''} onChange={(e) => update('available_time_to', e.target.value || null)} /></label></div></div>

    <div className="profile-preference-block"><strong>担当経験</strong><ToggleGroup options={classroomOptions} selected={draft.classroom_experience} onChange={(value) => update('classroom_experience', value)} /></div>
    <div className="profile-preference-block"><strong>リーダー・管理職経験</strong><ToggleGroup options={leadershipOptions} selected={draft.leadership_roles} onChange={(value) => update('leadership_roles', value)} /></div>
    <div className="profile-preference-block"><strong>希望する担当年齢</strong><ToggleGroup options={childAgeOptions} selected={draft.preferred_child_ages} onChange={(value) => update('preferred_child_ages', value)} /></div>
    <div className="profile-preference-block"><strong>大切にしたい保育観</strong><ToggleGroup options={childcareValueOptions} selected={draft.childcare_values} onChange={(value) => update('childcare_values', value)} /></div>
    <div className="profile-preference-block"><strong>働く環境で重視すること</strong><ToggleGroup options={workPreferenceOptions} selected={draft.work_preferences} onChange={(value) => update('work_preferences', value)} /></div>

    {error && <span className="form-error">{error}</span>}
    {notice && <span className="form-success">{notice}</span>}
    <div className="profile-preference-actions"><button type="button" className="primary-button" disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '詳しい希望条件を保存'}</button></div>
  </section>;
}
