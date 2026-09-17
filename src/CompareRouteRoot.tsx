import { ClerkProvider, useAuth, useClerk, useSession, useUser } from '@clerk/react';
import { useEffect, useMemo, useState } from 'react';
import { Brand } from './components/Brand';
import { Icon } from './components/Icon';
import { NotificationCenter } from './components/NotificationCenter';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { matchJob, type JobMatchResult } from './lib/jobMatching';
import { getJobseekerMatchingPreferences, type JobseekerMatchingPreferences } from './lib/profilePreferencesRepository';
import { getProfile, listJobs, type Job, type JobseekerProfile, type VerifiedFinanceMetric, type VerifiedWorkplaceMetric } from './lib/recruitRepository';
import { setSupabaseAccessTokenGetter } from './lib/supabase';
import './CompareRouteRoot.css';

const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const poppyUrl = (import.meta.env.VITE_HOIKU_POPPY_URL || 'https://app.hoikupoppy.ai').replace(/\/$/, '');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxComparedJobs = 3;

const navItems = [
  { href: '/', label: 'ホーム', icon: 'home' as const },
  { href: '/jobs', label: '求人を探す', icon: 'search' as const },
  { href: '/matches', label: 'マッチング', icon: 'sparkles' as const },
  { href: '/compare', label: '園比較', icon: 'shield' as const },
  { href: '/saved', label: '気になる', icon: 'heart' as const },
  { href: '/applications', label: '応募管理', icon: 'briefcase' as const },
  { href: '/scouts', label: 'スカウト', icon: 'sparkles' as const },
  { href: '/profile', label: 'プロフィール', icon: 'user' as const },
];

const workplacePriority = [
  'average_monthly_overtime_hours',
  'paid_leave_usage_rate_pct',
  'average_tenure_years',
  'average_monthly_saturday_shift_count',
  'average_monthly_early_shift_count',
  'average_monthly_late_shift_count',
  'nursery_teacher_ratio_pct',
  'full_time_ratio_pct',
];

const financePriority = [
  'finance_monthly_result_stability',
  'finance_budget_managed_months_12m',
  'finance_payroll_finalized_months_12m',
  'finance_closed_months_12m',
  'finance_close_within_45_days_pct',
  'finance_positive_month_ratio_pct',
  'finance_average_result_margin_pct',
];

type ComparedJob = { job: Job; match: JobMatchResult };

type ComparisonRow = {
  key: string;
  label: string;
  source: 'facility' | 'ho_verified' | 'hf_verified' | 'match';
  values: React.ReactNode[];
  note?: string;
};

export function CompareRouteRoot() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHoikuColorClerkPublishableKey()
      .then((value) => active && setKey(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'ログイン設定を取得できませんでした。'));
    return () => { active = false; };
  }, []);

  if (error) return <CompareRouteState title="ログイン設定を読み込めませんでした" body={error} action="再読み込み" onAction={() => window.location.reload()} />;
  if (!key) return <CompareRouteState title="Hoiku Color" body="ログイン設定を読み込んでいます" loading />;

  return <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/compare" signUpFallbackRedirectUrl="/compare">
    <CompareRouteGate />
  </ClerkProvider>;
}

function initialJobIds() {
  const params = new URLSearchParams(window.location.search);
  return [...new Set(params.getAll('job_id').filter((id) => uuidPattern.test(id)))].slice(0, maxComparedJobs);
}

function CompareRouteGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [preferences, setPreferences] = useState<JobseekerMatchingPreferences | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialJobIds);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setSupabaseAccessTokenGetter(null);
      return;
    }
    setSupabaseAccessTokenGetter(() => session.getToken());
    return () => setSupabaseAccessTokenGetter(null);
  }, [session]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) window.location.replace('/login');
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!session || !user?.id) return;
    let active = true;
    setLoading(true);
    Promise.all([listJobs(), getProfile(), getJobseekerMatchingPreferences()])
      .then(([jobRows, profileRow, preferenceRow]) => {
        if (!active) return;
        setJobs(jobRows);
        setProfile(profileRow);
        setPreferences(preferenceRow);
        const existingIds = new Set(jobRows.map((job) => job.id));
        setSelectedIds((current) => current.filter((id) => existingIds.has(id)).slice(0, maxComparedJobs));
        setError(null);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : '比較情報を読み込めませんでした。'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [session, user?.id]);

  useEffect(() => {
    const params = new URLSearchParams();
    selectedIds.forEach((id) => params.append('job_id', id));
    const query = params.toString();
    window.history.replaceState({}, '', query ? `/compare?${query}` : '/compare');
  }, [selectedIds]);

  const compared = useMemo<ComparedJob[]>(() => {
    if (!preferences) return [];
    const byId = new Map(jobs.map((job) => [job.id, job]));
    return selectedIds.flatMap((id) => {
      const job = byId.get(id);
      return job ? [{ job, match: matchJob({ job, profile, preferences }) }] : [];
    });
  }, [jobs, profile, preferences, selectedIds]);

  const rows = useMemo(() => buildComparisonRows(compared), [compared]);

  const toggleJob = (jobId: string) => {
    setSelectedIds((current) => {
      if (current.includes(jobId)) return current.filter((id) => id !== jobId);
      if (current.length >= maxComparedJobs) return current;
      return [...current, jobId];
    });
  };

  if (!isLoaded || !isSignedIn) return <CompareRouteState title="Hoiku Color" body="ログイン状態を確認しています" loading />;
  if (user?.unsafeMetadata?.hoikuColorAccountType === 'nursery') {
    return <CompareRouteState title="園・法人アカウントです" body="園・法人の管理画面はHoiku Poppyをご利用ください。" action="Hoiku Poppyを開く" onAction={() => window.location.assign(poppyUrl)} />;
  }

  const displayName = user?.fullName || user?.firstName || 'ゲスト';
  const logout = async () => {
    if (!window.confirm('Hoiku Colorからログアウトしますか？')) return;
    await signOut({ redirectUrl: '/login' });
  };

  return <div className="app-shell compare-route-shell">
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる"><Icon name="close" /></button>
      <a className="sidebar-brand" href="/"><Brand /></a>
      <span className="nav-label">MY PAGE</span>
      <nav className="side-nav" aria-label="マイページ">
        {navItems.map((item) => <a key={item.href} className={`nav-item ${item.href === '/compare' ? 'active' : ''}`} href={item.href}><Icon name={item.icon} size={18} /><span>{item.label}</span></a>)}
      </nav>
      <div className="sidebar-public"><span>HOIKU COLOR</span><strong>求人サイトを見る</strong><a href={`${publicUrl}/jobs`} target="_blank" rel="noreferrer">公開サイトを開く <Icon name="external" size={14} /></a></div>
      <div className="account-card"><div className="account-avatar">{displayName.slice(0, 1)}</div><div><strong>{displayName}</strong><small>{user?.primaryEmailAddress?.emailAddress || ''}</small></div><button type="button" title="ログアウト" onClick={() => void logout()}><Icon name="logout" size={17} /></button></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる" />}

    <main className="main-column">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="メニュー"><Icon name="menu" /></button>
        <div className="mobile-brand"><Brand compact /></div>
        <div className="topbar-spacer" />
        <a className="public-link" href={`${publicUrl}/jobs`} target="_blank" rel="noreferrer">求人サイト <Icon name="external" size={14} /></a>
        <NotificationCenter onNavigate={(target) => window.location.assign(target)} />
      </header>

      <section className="content compare-route-content">
        <header className="page-heading compare-route-heading"><div><span className="eyebrow">COMPARE FACILITIES</span><h1>園を横並びで比較</h1><p>最大3求人まで、園の掲載情報とHO/HF Verified実績を混ぜずに比較します。</p></div><a className="secondary-button" href="/matches"><Icon name="sparkles" size={15} /> マッチングへ戻る</a></header>

        <section className="compare-source-legend" aria-label="比較データの見方">
          <div><span className="source-pill source-facility">園掲載</span><p>求人票・園が公開した情報です。実績値とは別に表示します。</p></div>
          <div><span className="source-pill source-ho">HO Verified</span><p>Hoiku Officeの確定実績から自動集計された値です。</p></div>
          <div><span className="source-pill source-hf">HF Verified</span><p>Hoiku Financeの確定済み会計実績から自動集計された値です。</p></div>
        </section>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}>閉じる</button></div>}
        {loading ? <div className="compare-loading"><span className="loading-ring" /><strong>比較データを読み込んでいます</strong></div> : <>
          <section className="compare-picker" aria-label="比較する求人を選択">
            <div className="compare-picker-head"><div><span className="eyebrow">SELECT</span><h2>比較する求人</h2></div><strong>{selectedIds.length}/{maxComparedJobs}件</strong></div>
            {jobs.length ? <div className="compare-picker-grid">{jobs.map((job) => {
              const selected = selectedIds.includes(job.id);
              const disabled = !selected && selectedIds.length >= maxComparedJobs;
              return <button key={job.id} type="button" disabled={disabled} className={`compare-pick-card ${selected ? 'is-selected' : ''}`} onClick={() => toggleJob(job.id)}>
                <span className="compare-check" aria-hidden="true">{selected ? '✓' : '+'}</span>
                <span><strong>{job.facility_name}</strong><small>{job.title}</small><small>{[job.prefecture, job.city].filter(Boolean).join(' ') || '地域未設定'}</small></span>
              </button>;
            })}</div> : <div className="compare-empty"><Icon name="search" size={24} /><h2>現在比較できる公開求人がありません</h2><p>求人が公開されると、ここから2〜3件を選んで比較できます。</p></div>}
          </section>

          {compared.length < 2 ? <section className="compare-guidance"><Icon name="shield" size={22} /><div><h2>2件以上選ぶと比較表を表示します</h2><p>1件だけ選択した状態でもURLに保持されます。マッチング結果から比較へ追加し、ここで2件目・3件目を選べます。</p></div></section> : <ComparisonTable compared={compared} rows={rows} onRemove={(jobId) => setSelectedIds((current) => current.filter((id) => id !== jobId))} />}
        </>}
      </section>
    </main>
  </div>;
}

function ComparisonTable({ compared, rows, onRemove }: { compared: ComparedJob[]; rows: ComparisonRow[]; onRemove: (jobId: string) => void }) {
  return <section className="compare-table-panel" aria-label="園比較表">
    <div className="compare-table-scroll">
      <table className="compare-table">
        <thead><tr><th className="compare-row-label">比較項目</th>{compared.map(({ job }) => <th key={job.id}><div className="compare-job-heading"><strong>{job.facility_name}</strong><span>{job.title}</span><button type="button" onClick={() => onRemove(job.id)} aria-label={`${job.facility_name}を比較から外す`}>外す</button></div></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><th className="compare-row-label"><span className={`source-pill source-${row.source === 'ho_verified' ? 'ho' : row.source === 'hf_verified' ? 'hf' : row.source === 'match' ? 'match' : 'facility'}`}>{sourceLabel(row.source)}</span><strong>{row.label}</strong>{row.note && <small>{row.note}</small>}</th>{row.values.map((value, index) => <td key={`${row.key}-${compared[index]?.job.id || index}`}>{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="compare-disclaimer">Verifiedは各サービスの確定実績から取得できた項目だけを表示します。未取得は「実績未公開」とし、園の掲載値で補完しません。</p>
  </section>;
}

function buildComparisonRows(compared: ComparedJob[]): ComparisonRow[] {
  const facilityRows: ComparisonRow[] = [
    { key: 'condition-match', label: '希望条件マッチ', source: 'match', values: compared.map(({ match }) => valueNode(match.condition_score === null ? '希望条件未設定' : `${match.condition_score}%`, match.condition_score !== null && match.condition_score >= 70)) },
    { key: 'childcare-values', label: '保育観サイン', source: 'match', note: '求人文面に明示された表現だけを確認', values: compared.map(({ match }) => textNode(match.matched_childcare_values.length ? match.matched_childcare_values.join('・') : '明示的な一致サインなし')) },
    { key: 'location', label: '勤務地', source: 'facility', values: compared.map(({ job }) => textNode([job.prefecture, job.city, job.address].filter(Boolean).join(' ') || '未掲載')) },
    { key: 'employment', label: '雇用形態', source: 'facility', values: compared.map(({ job }) => textNode(job.employment_type || '未掲載')) },
    { key: 'salary', label: '給与', source: 'facility', values: compared.map(({ job }) => textNode(salaryLabel(job))) },
    { key: 'hours', label: '勤務時間', source: 'facility', values: compared.map(({ job }) => textNode(job.working_hours || '未掲載')) },
    { key: 'holidays', label: '休日', source: 'facility', values: compared.map(({ job }) => textNode(job.holidays || '未掲載')) },
    { key: 'qualification', label: '応募資格', source: 'facility', values: compared.map(({ job }) => textNode(job.required_qualification || '未掲載')) },
    { key: 'take-home-work', label: '持ち帰り', source: 'facility', note: '求人文面の明示のみ', values: compared.map(({ job }) => textNode(explicitTextSignal(job, ['持ち帰りなし', '持ち帰り仕事なし', '持ち帰り業務なし'], '持ち帰りなしと明記'))) },
    { key: 'staffing', label: '配置・人員体制', source: 'facility', note: '求人文面の明示のみ', values: compared.map(({ job }) => textNode(explicitTextSignal(job, ['基準以上の配置', '手厚い配置', '配置に余裕', 'ゆとりある配置'], '手厚い配置の記載あり'))) },
    { key: 'benefits', label: '福利厚生・制度', source: 'facility', values: compared.map(({ job }) => textNode(job.benefits || '未掲載')) },
  ];

  const workplaceRows = workplacePriority.map((metricKey): ComparisonRow => ({
    key: `ho-${metricKey}`,
    label: metricLabel(compared, 'workplace', metricKey),
    source: 'ho_verified',
    values: compared.map(({ job }) => verifiedMetricNode(job.verified_workplace?.verified_metrics?.[metricKey] || null, 'HO')),
  }));

  const financeRows = financePriority.map((metricKey): ComparisonRow => ({
    key: `hf-${metricKey}`,
    label: metricLabel(compared, 'finance', metricKey),
    source: 'hf_verified',
    values: compared.map(({ job }) => verifiedMetricNode(job.verified_finance?.verified_metrics?.[metricKey] || null, 'HF')),
  }));

  return [...facilityRows, ...workplaceRows, ...financeRows].filter((row) => row.source === 'facility' || row.source === 'match' || row.values.some((value) => value !== null));
}

function metricLabel(compared: ComparedJob[], kind: 'workplace' | 'finance', key: string) {
  for (const { job } of compared) {
    const metric = kind === 'workplace' ? job.verified_workplace?.verified_metrics?.[key] : job.verified_finance?.verified_metrics?.[key];
    if (metric?.label) return metric.label;
  }
  const fallback: Record<string, string> = {
    average_monthly_overtime_hours: '平均時間外労働', paid_leave_usage_rate_pct: '有休取得率', average_tenure_years: '平均勤続年数', average_monthly_saturday_shift_count: '平均土曜勤務回数', average_monthly_early_shift_count: '平均早番回数', average_monthly_late_shift_count: '平均遅番回数', nursery_teacher_ratio_pct: '保育士比率', full_time_ratio_pct: '常勤比率', finance_monthly_result_stability: '月次収支安定性', finance_budget_managed_months_12m: '予算管理実績', finance_payroll_finalized_months_12m: '給与確定実績', finance_closed_months_12m: '月次締め実績', finance_close_within_45_days_pct: '45日以内締め率', finance_positive_month_ratio_pct: '黒字月比率', finance_average_result_margin_pct: '平均収支率',
  };
  return fallback[key] || key;
}

function verifiedMetricNode(metric: VerifiedWorkplaceMetric | VerifiedFinanceMetric | null, source: 'HO' | 'HF'): React.ReactNode {
  if (!metric || metric.value === null || metric.value === undefined) return <span className="compare-missing">実績未公開</span>;
  const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value;
  return <div className="compare-verified-value"><strong>{value}{metric.unit || ''}</strong><small>{source} Verified ・ n={metric.sample_size}</small></div>;
}

function textNode(value: string): React.ReactNode {
  return <span className={value.includes('未掲載') || value.includes('明記なし') ? 'compare-missing' : ''}>{value}</span>;
}

function valueNode(value: string, strong: boolean): React.ReactNode {
  return <strong className={strong ? 'compare-strong-value' : ''}>{value}</strong>;
}

function explicitTextSignal(job: Job, phrases: string[], positiveLabel: string) {
  const text = [job.description, job.working_hours, job.holidays, job.benefits].filter(Boolean).join('');
  return phrases.some((phrase) => text.includes(phrase)) ? positiveLabel : '求人情報に明記なし';
}

function salaryLabel(job: Job) {
  const format = (value: number | null) => value === null ? null : new Intl.NumberFormat('ja-JP').format(value);
  const min = format(job.salary_min);
  const max = format(job.salary_max);
  const unit = job.salary_type === 'hourly' ? '時給' : job.salary_type === 'annual' ? '年収' : job.salary_type === 'monthly' ? '月給' : '給与';
  if (min && max) return `${unit} ${min}〜${max}円${job.salary_note ? `（${job.salary_note}）` : ''}`;
  if (min) return `${unit} ${min}円〜${job.salary_note ? `（${job.salary_note}）` : ''}`;
  if (max) return `${unit} 〜${max}円${job.salary_note ? `（${job.salary_note}）` : ''}`;
  return job.salary_note || '未掲載';
}

function sourceLabel(source: ComparisonRow['source']) {
  if (source === 'ho_verified') return 'HO Verified';
  if (source === 'hf_verified') return 'HF Verified';
  if (source === 'match') return 'マッチング';
  return '園掲載';
}

function CompareRouteState({ title, body, loading, action, onAction }: { title: string; body: string; loading?: boolean; action?: string; onAction?: () => void }) {
  return <main className="centered-state">{loading && <span className="loading-ring" />}<strong>{title}</strong><p>{body}</p>{action && onAction && <button className="primary-button" onClick={onAction}>{action}</button>}</main>;
}
