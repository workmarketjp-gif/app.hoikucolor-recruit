import { ClerkProvider, useAuth, useClerk, useSession, useUser } from '@clerk/react';
import { useEffect, useMemo, useState } from 'react';
import { Brand } from './components/Brand';
import { Icon } from './components/Icon';
import { NotificationCenter } from './components/NotificationCenter';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { compareMatchedJobs, matchJob, type JobMatchResult } from './lib/jobMatching';
import { getJobseekerMatchingPreferences, type JobseekerMatchingPreferences } from './lib/profilePreferencesRepository';
import {
  getProfile,
  listJobs,
  listSavedJobIds,
  saveJob,
  submitApplication,
  unsaveJob,
  type Job,
  type JobseekerProfile,
} from './lib/recruitRepository';
import { setSupabaseAccessTokenGetter } from './lib/supabase';
import './MatchRouteRoot.css';

const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const poppyUrl = (import.meta.env.VITE_HOIKU_POPPY_URL || 'https://app.hoikupoppy.ai').replace(/\/$/, '');

const navItems = [
  { href: '/', label: 'ホーム', icon: 'home' as const },
  { href: '/jobs', label: '求人を探す', icon: 'search' as const },
  { href: '/matches', label: 'マッチング', icon: 'sparkles' as const },
  { href: '/saved', label: '気になる', icon: 'heart' as const },
  { href: '/applications', label: '応募管理', icon: 'briefcase' as const },
  { href: '/scouts', label: 'スカウト', icon: 'sparkles' as const },
  { href: '/profile', label: 'プロフィール', icon: 'user' as const },
];

type RankedJob = { job: Job; match: JobMatchResult };

export function MatchRouteRoot() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHoikuColorClerkPublishableKey()
      .then((value) => active && setKey(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'ログイン設定を取得できませんでした。'));
    return () => { active = false; };
  }, []);

  if (error) return <MatchRouteState title="ログイン設定を読み込めませんでした" body={error} action="再読み込み" onAction={() => window.location.reload()} />;
  if (!key) return <MatchRouteState title="Hoiku Color" body="ログイン設定を読み込んでいます" loading />;

  return (
    <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/matches" signUpFallbackRedirectUrl="/matches">
      <MatchRouteGate />
    </ClerkProvider>
  );
}

function MatchRouteGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [preferences, setPreferences] = useState<JobseekerMatchingPreferences | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyStrong, setOnlyStrong] = useState(false);

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
    Promise.all([listJobs(), getProfile(), getJobseekerMatchingPreferences(), listSavedJobIds()])
      .then(([jobRows, profileRow, preferenceRow, savedRows]) => {
        if (!active) return;
        setJobs(jobRows);
        setProfile(profileRow);
        setPreferences(preferenceRow);
        setSavedIds(savedRows);
        setError(null);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : 'マッチング情報を読み込めませんでした。'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [session, user?.id]);

  const ranked = useMemo<RankedJob[]>(() => {
    if (!preferences) return [];
    return jobs
      .map((job) => ({ job, match: matchJob({ job, profile, preferences }) }))
      .sort(compareMatchedJobs);
  }, [jobs, profile, preferences]);

  const visible = onlyStrong
    ? ranked.filter((item) => item.match.condition_score !== null && item.match.condition_score >= 70)
    : ranked;
  const hasPreferences = ranked.some((item) => item.match.has_preferences) || Boolean(preferences && (
    preferences.childcare_values.length || preferences.work_preferences.length || preferences.desired_prefectures.length || preferences.desired_cities.length
  ));

  const toggleSaved = async (jobId: string) => {
    if (!user?.id) return;
    const wasSaved = savedIds.includes(jobId);
    setSavedIds((current) => wasSaved ? current.filter((id) => id !== jobId) : [jobId, ...current]);
    try {
      if (wasSaved) await unsaveJob(jobId);
      else await saveJob(jobId, user.id);
    } catch (err) {
      setSavedIds((current) => wasSaved ? [jobId, ...current] : current.filter((id) => id !== jobId));
      setError(err instanceof Error ? err.message : '保存状態を更新できませんでした。');
    }
  };

  if (!isLoaded || !isSignedIn) return <MatchRouteState title="Hoiku Color" body="ログイン状態を確認しています" loading />;
  if (user?.unsafeMetadata?.hoikuColorAccountType === 'nursery') {
    return <MatchRouteState title="園・法人アカウントです" body="園・法人の管理画面はHoiku Poppyをご利用ください。" action="Hoiku Poppyを開く" onAction={() => window.location.assign(poppyUrl)} />;
  }

  const displayName = user?.fullName || user?.firstName || 'ゲスト';
  const logout = async () => {
    if (!window.confirm('Hoiku Colorからログアウトしますか？')) return;
    await signOut({ redirectUrl: '/login' });
  };

  return (
    <div className="app-shell match-route-shell">
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる"><Icon name="close" /></button>
        <a className="sidebar-brand" href="/"><Brand /></a>
        <span className="nav-label">MY PAGE</span>
        <nav className="side-nav" aria-label="マイページ">
          {navItems.map((item) => (
            <a key={item.href} className={`nav-item ${item.href === '/matches' ? 'active' : ''}`} href={item.href}>
              <Icon name={item.icon} size={18} /><span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-public">
          <span>HOIKU COLOR</span><strong>求人サイトを見る</strong>
          <a href={`${publicUrl}/jobs`} target="_blank" rel="noreferrer">公開サイトを開く <Icon name="external" size={14} /></a>
        </div>
        <div className="account-card">
          <div className="account-avatar">{displayName.slice(0, 1)}</div>
          <div><strong>{displayName}</strong><small>{user?.primaryEmailAddress?.emailAddress || ''}</small></div>
          <button type="button" title="ログアウト" onClick={() => void logout()}><Icon name="logout" size={17} /></button>
        </div>
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

        <section className="content match-route-content">
          <header className="page-heading match-route-heading">
            <div><span className="eyebrow">YOUR MATCH</span><h1>あなたに合う求人</h1><p>勤務地・雇用形態・給与などは通常ロジックで判定し、保育観は求人文面との一致サインを分けて表示します。</p></div>
            <a className="secondary-button" href="/scouts#scout-settings"><Icon name="user" size={15} /> 希望条件を見直す</a>
          </header>

          <section className="match-explain" aria-label="マッチングの考え方">
            <span className="match-explain-icon"><Icon name="shield" size={20} /></span>
            <div><strong>点数の根拠を隠しません</strong><p>条件マッチは登録した希望条件だけで計算します。HO/HF Verifiedは求人の実績確認と同点時の並び順に使い、園の申告値と混ぜません。保育観は現在、求人文面に明示された表現だけを参考サインとして表示します。</p></div>
          </section>

          {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}>閉じる</button></div>}
          {loading ? <div className="match-loading"><span className="loading-ring" /><strong>マッチングしています</strong></div> : <>
            {!hasPreferences && <section className="match-setup-callout"><div><span className="eyebrow">SET YOUR PREFERENCES</span><h2>希望条件と保育観を登録すると、おすすめ順が使えます。</h2><p>氏名・メール・電話番号はマッチング点数には使用しません。</p></div><a className="primary-button" href="/scouts#scout-settings">条件を登録する</a></section>}
            <div className="match-toolbar"><div><strong>{visible.length}件</strong><span> 条件マッチ順</span></div><label><input type="checkbox" checked={onlyStrong} onChange={(event) => setOnlyStrong(event.target.checked)} /> 70%以上だけ表示</label></div>
            {visible.length ? <div className="match-job-grid">{visible.map(({ job, match }) => <MatchJobCard key={job.id} job={job} match={match} saved={savedIds.includes(job.id)} profile={profile} onToggleSaved={toggleSaved} />)}</div> : <div className="match-empty"><Icon name="search" size={24} /><h2>表示できる求人がありません</h2><p>{jobs.length ? '70%以上だけ表示を解除すると、すべての求人を確認できます。' : '現在公開中の求人はありません。求人が公開されると条件に合わせて自動で並びます。'}</p></div>}
          </>}
        </section>
      </main>
    </div>
  );
}

function MatchJobCard({ job, match, saved, profile, onToggleSaved }: { job: Job; match: JobMatchResult; saved: boolean; profile: JobseekerProfile | null; onToggleSaved: (jobId: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const apply = async () => {
    if (!profile?.name?.trim()) {
      setApplyError('応募前にプロフィールのお名前を登録してください。');
      return;
    }
    setApplying(true); setApplyError(null);
    try {
      await submitApplication(job.id, profile);
      window.location.assign('/applications');
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : '応募を送信できませんでした。');
    } finally {
      setApplying(false);
    }
  };

  return <article className="match-job-card">
    <div className="match-job-top">
      <div><span className="match-location"><Icon name="map" size={14} /> {job.prefecture || '地域未設定'} {job.city || ''}</span><span className="match-facility">{job.facility_name}</span></div>
      <button className={`heart-button ${saved ? 'saved' : ''}`} type="button" onClick={() => void onToggleSaved(job.id)} aria-label={saved ? '気になるから削除' : '気になるに保存'}><Icon name="heart" size={18} /></button>
    </div>
    <h2>{job.title}</h2>
    <div className="match-score-row">
      <span className={`match-score ${match.condition_score !== null && match.condition_score >= 70 ? 'is-strong' : ''}`}><small>条件マッチ</small><strong>{match.condition_score === null ? '—' : `${match.condition_score}%`}</strong></span>
      <span className="match-value-score"><small>保育観サイン</small><strong>{match.childcare_value_signal_pct === null ? '未設定' : `${match.matched_childcare_values.length}/${match.matched_childcare_values.length + match.unmatched_childcare_values.length}一致`}</strong></span>
    </div>
    <div className="match-tags">{job.employment_type && <span>{job.employment_type}</span>}{job.verified_workplace?.verified_metric_count ? <span className="verified-tag">✓ HO実績</span> : null}{job.verified_finance?.verified_metric_count ? <span className="finance-verified-tag">✓ HF実績</span> : null}</div>
    <div className="match-salary"><Icon name="yen" size={16} /><strong>{salaryLabel(job)}</strong></div>

    {match.condition_reasons.length > 0 && <div className="match-reasons"><strong>合っている条件</strong>{match.condition_reasons.slice(0, expanded ? 6 : 3).map((reason) => <span key={reason}>✓ {reason}</span>)}</div>}
    {match.matched_childcare_values.length > 0 && <div className="match-values"><strong>求人文面で確認できた保育観</strong><div>{match.matched_childcare_values.map((value) => <span key={value}>{value}</span>)}</div></div>}

    {expanded && <div className="match-expanded">
      {match.condition_gaps.length > 0 && <section><strong>確認したい点</strong>{match.condition_gaps.map((gap) => <p key={gap}>・{gap}</p>)}</section>}
      {match.unmatched_childcare_values.length > 0 && <section><strong>保育観は要確認</strong><p>「{match.unmatched_childcare_values.join('・')}」は求人文面だけでは確認できません。未一致ではなく、情報不足として扱っています。</p></section>}
      <section><strong>求人内容</strong><p>{job.description}</p></section>
      <dl>{job.working_hours && <><dt>勤務時間</dt><dd>{job.working_hours}</dd></>}{job.holidays && <><dt>休日</dt><dd>{job.holidays}</dd></>}{job.required_qualification && <><dt>応募資格</dt><dd>{job.required_qualification}</dd></>}{job.benefits && <><dt>待遇</dt><dd>{job.benefits}</dd></>}</dl>
    </div>}
    {applyError && <span className="form-error">{applyError}</span>}
    <div className="match-actions"><button className="secondary-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? '閉じる' : '根拠・詳細を見る'}</button><button className="primary-button" type="button" disabled={applying} onClick={() => void apply()}>{applying ? '応募中…' : '応募する'} <Icon name="arrow" size={15} /></button></div>
  </article>;
}

function MatchRouteState({ title, body, loading, action, onAction }: { title: string; body: string; loading?: boolean; action?: string; onAction?: () => void }) {
  return <div className="match-route-state">{loading && <span className="loading-ring" />}<Brand /><h1>{title}</h1><p>{body}</p>{action && onAction && <button className="primary-button" type="button" onClick={onAction}>{action}</button>}</div>;
}

function salaryLabel(job: Job) {
  if (job.salary_note) return job.salary_note;
  const prefix = job.salary_type === 'hourly' ? '時給' : '月給';
  if (job.salary_min && job.salary_max) return `${prefix} ${job.salary_min.toLocaleString()}〜${job.salary_max.toLocaleString()}円`;
  if (job.salary_min) return `${prefix} ${job.salary_min.toLocaleString()}円〜`;
  return '給与は求人詳細をご確認ください';
}
