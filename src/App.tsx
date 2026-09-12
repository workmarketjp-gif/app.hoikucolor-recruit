import { SignOutButton, useUser } from '@clerk/react';
import { useEffect, useState } from 'react';
import { Brand } from './components/Brand';
import { Icon } from './components/Icon';
import { ApplicationDetail } from './components/ApplicationDetail';
import { DocumentVaultPanel } from './components/DocumentVaultPanel';
import { VisitTrialPanel } from './components/VisitTrialPanel';
import { VerifiedFinanceSummary } from './components/VerifiedFinanceSummary';
import { NotificationCenter } from './components/NotificationCenter';
import {
  getJobSearchFacets, getProfile, listApplications, listFeaturedJobs, listSavedJobIds, listSavedRankedJobs,
  saveJob, searchJobs, submitApplication, unsaveJob, upsertProfile,
  type Application, type Job, type JobSearchCursor, type JobseekerProfile, type VerifiedWorkplaceMetric,
} from './lib/recruitRepository';

type View = 'home' | 'jobs' | 'saved' | 'applications' | 'profile';
const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const applicationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const viewPaths: Record<View, string> = { home: '/', jobs: '/jobs', saved: '/saved', applications: '/applications', profile: '/profile' };
const navItems: { view: View; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { view: 'home', label: 'ホーム', icon: 'home' },
  { view: 'jobs', label: '求人を探す', icon: 'search' },
  { view: 'saved', label: '気になる', icon: 'heart' },
  { view: 'applications', label: '応募管理', icon: 'briefcase' },
  { view: 'profile', label: 'プロフィール', icon: 'user' },
];

const verifiedPriority = [
  'average_monthly_overtime_hours',
  'paid_leave_usage_rate_pct',
  'average_tenure_years',
  'average_monthly_saturday_shift_count',
  'nursery_teacher_ratio_pct',
  'average_experience_years',
  'average_monthly_early_shift_count',
  'average_monthly_late_shift_count',
  'full_time_ratio_pct',
  'average_age_years',
];

function pathToView(pathname: string): View {
  const match = (Object.entries(viewPaths) as [View, string][]).find(([, path]) => path !== '/' && pathname.startsWith(path));
  return match?.[0] || 'home';
}

function applicationIdFromLocation() {
  if (!window.location.pathname.startsWith('/applications')) return null;
  const value = new URLSearchParams(window.location.search).get('application_id');
  return value && applicationIdPattern.test(value) ? value : null;
}

export function App() {
  const { user } = useUser();
  const [view, setView] = useState<View>(() => pathToView(window.location.pathname));
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(() => applicationIdFromLocation());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [publicJobCount, setPublicJobCount] = useState(0);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [profile, setProfile] = useState<JobseekerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onPop = () => {
      setView(pathToView(window.location.pathname));
      setSelectedApplicationId(applicationIdFromLocation());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setLoading(true);
    Promise.all([listFeaturedJobs(3), listSavedRankedJobs(), listSavedJobIds(), listApplications(), getProfile()])
      .then(([featuredPage, savedJobRows, savedRows, applicationRows, profileRow]) => {
        if (!active) return;
        setJobs(featuredPage.jobs); setPublicJobCount(featuredPage.totalCount); setSavedJobs(savedJobRows);
        setSavedIds(savedRows); setApplications(applicationRows);
        setProfile(profileRow || {
          clerk_user_id: user.id,
          email: user.primaryEmailAddress?.emailAddress || null,
          name: user.fullName || null,
          name_kana: null, phone: null, prefecture: null,
          desired_positions: [], desired_employment_types: [], qualifications: [],
          years_of_experience: null, desired_start_date: null, self_intro: null,
        });
        setError(null);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : 'データを読み込めませんでした。'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [user?.id]);

  const navigate = (next: View) => {
    window.history.pushState({}, '', viewPaths[next]);
    setView(next); setSelectedApplicationId(null); setMobileOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openApplication = (applicationId: string) => {
    if (!applicationIdPattern.test(applicationId)) return;
    window.history.pushState({}, '', `/applications?application_id=${encodeURIComponent(applicationId)}`);
    setView('applications'); setSelectedApplicationId(applicationId); setMobileOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeApplication = () => {
    window.history.pushState({}, '', '/applications');
    setView('applications'); setSelectedApplicationId(null); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateTarget = (target: string) => {
    try {
      const url = new URL(target, window.location.origin);
      if (url.origin !== window.location.origin) return navigate('applications');
      const nextView = pathToView(url.pathname);
      if (nextView === 'applications') {
        const applicationId = url.searchParams.get('application_id');
        if (applicationId && applicationIdPattern.test(applicationId)) return openApplication(applicationId);
      }
      navigate(nextView);
    } catch {
      navigate('applications');
    }
  };

  const toggleSaved = async (jobId: string) => {
    if (!user?.id) return;
    const wasSaved = savedIds.includes(jobId);
    setSavedIds((prev) => wasSaved ? prev.filter((id) => id !== jobId) : [jobId, ...prev]);
    if (wasSaved) setSavedJobs((prev) => prev.filter((job) => job.id !== jobId));
    try {
      if (wasSaved) await unsaveJob(jobId); else await saveJob(jobId, user.id);
      setSavedJobs(await listSavedRankedJobs());
    } catch (err) {
      setSavedIds((prev) => wasSaved ? [jobId, ...prev] : prev.filter((id) => id !== jobId));
      setSavedJobs(await listSavedRankedJobs().catch(() => savedJobs));
      setError(err instanceof Error ? err.message : '保存状態を更新できませんでした。');
    }
  };

  const displayName = profile?.name || user?.firstName || 'ゲスト';

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる"><Icon name="close" /></button>
        <button className="sidebar-brand" onClick={() => navigate('home')}><Brand /></button>
        <span className="nav-label">MY PAGE</span>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button key={item.view} className={`nav-item ${view === item.view ? 'active' : ''}`} onClick={() => navigate(item.view)}>
              <Icon name={item.icon} size={18} /><span>{item.label}</span>
              {item.view === 'saved' && savedIds.length > 0 && <em>{savedIds.length}</em>}
              {item.view === 'applications' && applications.length > 0 && <em>{applications.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-public">
          <span>HOIKU COLOR</span>
          <strong>求人サイトを見る</strong>
          <a href={`${publicUrl}/jobs`} target="_blank" rel="noreferrer">公開サイトを開く <Icon name="external" size={14} /></a>
        </div>
        <div className="account-card">
          <div className="account-avatar">{displayName.slice(0, 1)}</div>
          <div><strong>{displayName}</strong><small>{user?.primaryEmailAddress?.emailAddress || ''}</small></div>
          <SignOutButton><button title="ログアウト"><Icon name="logout" size={17} /></button></SignOutButton>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる" />}

      <main className="main-column">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="メニュー"><Icon name="menu" /></button>
          <div className="mobile-brand"><Brand compact /></div>
          <div className="topbar-spacer" />
          <a className="public-link" href={`${publicUrl}/jobs`} target="_blank" rel="noreferrer">求人サイト <Icon name="external" size={14} /></a>
          <NotificationCenter onNavigate={navigateTarget} />
        </header>

        <section className="content">
          {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError(null)}>閉じる</button></div>}
          {loading ? <LoadingView /> : (
            <>
              {view === 'home' && <Dashboard name={displayName} jobs={jobs} publicJobCount={publicJobCount} savedIds={savedIds} applications={applications} onNavigate={navigate} onToggleSaved={toggleSaved} />}
              {view === 'jobs' && <JobsView savedIds={savedIds} onToggleSaved={toggleSaved} />}
              {view === 'saved' && <SavedView jobs={savedJobs} onToggleSaved={toggleSaved} />}
              {view === 'applications' && (selectedApplicationId ? <ApplicationDetail applicationId={selectedApplicationId} onBack={closeApplication} /> : <ApplicationsView applications={applications} onOpen={openApplication} />)}
              {view === 'profile' && profile && <ProfileView profile={profile} onChange={setProfile} />}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Dashboard({ name, jobs, publicJobCount, savedIds, applications, onNavigate, onToggleSaved }: { name: string; jobs: Job[]; publicJobCount: number; savedIds: string[]; applications: Application[]; onNavigate: (v: View) => void; onToggleSaved: (id: string) => void }) {
  const latest = jobs.slice(0, 3);
  const inProgress = applications.filter((a) => !['rejected', 'withdrawn', 'hired'].includes(a.status)).length;
  return <>
    <header className="page-heading"><div><span className="eyebrow">MY DASHBOARD</span><h1>{name}さん、こんにちは。</h1><p>気になる園と応募状況を、ここからまとめて確認できます。</p></div></header>
    <section className="welcome-card">
      <div><span className="eyebrow">HOIKU COLOR</span><h2>保育観から、自分に合う園を見つけよう。</h2><p>条件だけでは見えにくい、園ごとの色・雰囲気・働き方まで比較できます。</p></div>
      <button className="primary-button" onClick={() => onNavigate('jobs')}><Icon name="search" size={16} /> 求人を探す</button>
    </section>
    <div className="metric-grid">
      <button className="metric-card" onClick={() => onNavigate('saved')}><span className="metric-icon"><Icon name="heart" /></span><span>気になる求人</span><strong>{savedIds.length}<small>件</small></strong><p>保存した求人を比較</p></button>
      <button className="metric-card" onClick={() => onNavigate('applications')}><span className="metric-icon"><Icon name="briefcase" /></span><span>応募履歴</span><strong>{applications.length}<small>件</small></strong><p>これまでの応募</p></button>
      <button className="metric-card" onClick={() => onNavigate('applications')}><span className="metric-icon"><Icon name="clock" /></span><span>選考中</span><strong>{inProgress}<small>件</small></strong><p>現在進んでいる選考</p></button>
      <button className="metric-card" onClick={() => onNavigate('jobs')}><span className="metric-icon"><Icon name="sparkles" /></span><span>公開求人</span><strong>{publicJobCount}<small>件</small></strong><p>現在掲載中</p></button>
    </div>
    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">NEW JOBS</span><h3>おすすめ求人</h3></div><button onClick={() => onNavigate('jobs')}>すべて見る <Icon name="chevron" size={14} /></button></div>
      {latest.length ? <div className="job-list compact">{latest.map((job) => <JobRow key={job.id} job={job} saved={savedIds.includes(job.id)} onToggleSaved={onToggleSaved} />)}</div> : <EmptyState title="公開中の求人はまだありません" body="園から求人が公開されると、ここに求人が表示されます。" />}
    </section>
  </>;
}

function JobsView({ savedIds, onToggleSaved }: { savedIds: string[]; onToggleSaved: (id: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [employment, setEmployment] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [financeVerifiedOnly, setFinanceVerifiedOnly] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [prefectures, setPrefectures] = useState<string[]>([]);
  const [employments, setEmployments] = useState<string[]>([]);
  const [cursor, setCursor] = useState<JobSearchCursor | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searching, setSearching] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getJobSearchFacets()
      .then((facets) => {
        if (!active) return;
        setPrefectures(facets.prefectures);
        setEmployments(facets.employmentTypes);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      searchJobs({ keyword, prefecture, employmentType: employment, hoVerifiedOnly: verifiedOnly, hfVerifiedOnly: financeVerifiedOnly, limit: 24 })
        .then((page) => {
          if (!active) return;
          setJobs(page.jobs);
          setTotalCount(page.totalCount);
          setHasMore(page.hasMore);
          setCursor(page.nextCursor);
        })
        .catch((err) => active && setSearchError(err instanceof Error ? err.message : '求人を検索できませんでした。'))
        .finally(() => active && setSearching(false));
    }, keyword.trim() ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [keyword, prefecture, employment, verifiedOnly, financeVerifiedOnly]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setSearchError(null);
    try {
      const page = await searchJobs({ keyword, prefecture, employmentType: employment, hoVerifiedOnly: verifiedOnly, hfVerifiedOnly: financeVerifiedOnly, limit: 24, cursor });
      setJobs((prev) => [...prev, ...page.jobs.filter((job) => !prev.some((existing) => existing.id === job.id))]);
      setTotalCount(page.totalCount);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '次の求人を読み込めませんでした。');
    } finally {
      setLoadingMore(false);
    }
  };

  return <>
    <header className="page-heading"><div><span className="eyebrow">JOB SEARCH</span><h1>求人を探す</h1><p>園の色・保育観・働き方を見ながら、自分に合う求人を探せます。</p></div><span className="result-count">{totalCount}件</span></header>
    <section className="search-panel">
      <label className="keyword-box"><Icon name="search" size={18} /><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="園名、職種、キーワードで検索" /></label>
      <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)}><option value="">すべての都道府県</option>{prefectures.map((p) => <option key={p}>{p}</option>)}</select>
      <select value={employment} onChange={(e) => setEmployment(e.target.value)}><option value="">すべての雇用形態</option>{employments.map((p) => <option key={p}>{p}</option>)}</select>
      <label className="verified-filter"><input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} /><span>HO実績データあり</span></label>
      <label className="verified-filter"><input type="checkbox" checked={financeVerifiedOnly} onChange={(e) => setFinanceVerifiedOnly(e.target.checked)} /><span>HF実績データあり</span></label>
    </section>
    {searchError && <div className="error-banner"><span>{searchError}</span><button onClick={() => setSearchError(null)}>閉じる</button></div>}
    {searching && !jobs.length ? <LoadingView /> : jobs.length ? <>
      <div className="job-grid" aria-busy={searching}>{jobs.map((job) => <JobCard key={job.id} job={job} saved={savedIds.includes(job.id)} onToggleSaved={onToggleSaved} />)}</div>
      {hasMore && <div className="form-actions"><button className="secondary-button" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? '読み込み中…' : `さらに求人を見る（${jobs.length}/${totalCount}件）`}</button></div>}
    </> : <EmptyState title="条件に合う求人がありません" body="検索条件を変更して、もう一度探してみてください。" />}
  </>;
}

function SavedView({ jobs, onToggleSaved }: { jobs: Job[]; onToggleSaved: (id: string) => void }) {
  return <><header className="page-heading"><div><span className="eyebrow">SAVED JOBS</span><h1>気になる求人</h1><p>あとで見返したい求人をまとめて比較できます。</p></div><span className="result-count">{jobs.length}件</span></header>{jobs.length ? <div className="job-grid">{jobs.map((job) => <JobCard key={job.id} job={job} saved onToggleSaved={onToggleSaved} />)}</div> : <EmptyState title="保存した求人はまだありません" body="求人検索で「気になる」を押すと、ここに保存されます。" action="求人を探す" href="/jobs" />}</>;
}

function ApplicationsView({ applications, onOpen }: { applications: Application[]; onOpen: (applicationId: string) => void }) {
  return <><header className="page-heading"><div><span className="eyebrow">APPLICATIONS</span><h1>応募管理</h1><p>応募から面接・内定までの状況を確認できます。</p></div><span className="result-count">{applications.length}件</span></header>
    <section className="panel application-panel">{applications.length ? applications.map((app) => <article className="application-row" key={app.id} role="button" tabIndex={0} aria-label={`${app.facility_name} ${app.job_title}の応募詳細を開く`} onClick={() => onOpen(app.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(app.id); } }}><div className="application-mark"><Icon name="briefcase" size={18} /></div><div className="application-main"><span className={`status-badge status-${app.status}`}>{statusLabel(app.status)}</span><h3>{app.job_title || '求人'}</h3><p>{app.facility_name || ''}</p><small>応募日 {formatDate(app.applied_at)}</small><span className="application-open-detail">詳細を見る <Icon name="arrow" size={13} /></span></div><div className="application-side">{(app.prefecture || app.city) && <span><Icon name="map" size={14} /> {app.prefecture || ''} {app.city || ''}</span>}{app.employment_type && <span><Icon name="briefcase" size={14} /> {app.employment_type}</span>}</div></article>) : <EmptyState title="応募履歴はまだありません" body="気になる園を見つけたら、求人一覧から応募できます。" action="求人を探す" href="/jobs" />}</section>
  </>;
}

function ProfileView({ profile, onChange }: { profile: JobseekerProfile; onChange: (p: JobseekerProfile) => void }) {
  const [draft, setDraft] = useState(profile); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState<string | null>(null);
  const update = (key: keyof JobseekerProfile, value: JobseekerProfile[keyof JobseekerProfile]) => setDraft((p) => ({ ...p, [key]: value }));
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setSaved(false); setError(null); try { await upsertProfile(draft); onChange(draft); setSaved(true); } catch (err) { setError(err instanceof Error ? err.message : '保存できませんでした。'); } finally { setSaving(false); } };
  return <><header className="page-heading"><div><span className="eyebrow">PROFILE</span><h1>プロフィール</h1><p>応募時に使う基本情報と希望条件を登録できます。</p></div></header>
    <form className="profile-form" onSubmit={submit}>
      <section className="form-section"><div className="form-section-head"><h3>基本情報</h3><p>園からの連絡や応募情報に使用します。</p></div><div className="form-grid">
        <Field label="お名前"><input value={draft.name || ''} onChange={(e) => update('name', e.target.value)} /></Field>
        <Field label="フリガナ"><input value={draft.name_kana || ''} onChange={(e) => update('name_kana', e.target.value)} /></Field>
        <Field label="メールアドレス"><input type="email" value={draft.email || ''} onChange={(e) => update('email', e.target.value)} /></Field>
        <Field label="電話番号"><input value={draft.phone || ''} onChange={(e) => update('phone', e.target.value)} /></Field>
        <Field label="お住まいの都道府県"><input value={draft.prefecture || ''} onChange={(e) => update('prefecture', e.target.value)} placeholder="例：東京都" /></Field>
        <Field label="保育経験年数"><input type="number" min="0" step="0.5" value={draft.years_of_experience ?? ''} onChange={(e) => update('years_of_experience', e.target.value ? Number(e.target.value) : null)} /></Field>
      </div></section>
      <section className="form-section"><div className="form-section-head"><h3>希望条件</h3><p>カンマ区切りで複数登録できます。</p></div><div className="form-grid">
        <Field label="希望職種"><input value={draft.desired_positions.join(', ')} onChange={(e) => update('desired_positions', csv(e.target.value))} placeholder="保育士, 保育教諭" /></Field>
        <Field label="希望雇用形態"><input value={draft.desired_employment_types.join(', ')} onChange={(e) => update('desired_employment_types', csv(e.target.value))} placeholder="正社員, パート" /></Field>
        <Field label="資格"><input value={draft.qualifications.join(', ')} onChange={(e) => update('qualifications', csv(e.target.value))} placeholder="保育士, 幼稚園教諭" /></Field>
        <Field label="勤務開始希望日"><input type="date" value={draft.desired_start_date || ''} onChange={(e) => update('desired_start_date', e.target.value || null)} /></Field>
        <Field label="自己紹介" wide><textarea rows={5} value={draft.self_intro || ''} onChange={(e) => update('self_intro', e.target.value)} placeholder="大切にしている保育観や、これまでの経験など" /></Field>
      </div></section>
      <div className="form-actions">{error && <span className="form-error">{error}</span>}{saved && <span className="form-success">保存しました</span>}<button className="primary-button" disabled={saving}>{saving ? '保存中…' : 'プロフィールを保存'}</button></div>
    </form>
    <DocumentVaultPanel />
  </>;
}

function JobCard({ job, saved, onToggleSaved }: { job: Job; saved: boolean; onToggleSaved: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const apply = async () => {
    setApplying(true); setApplyError(null);
    try {
      const profile = await getProfile();
      if (!profile?.name?.trim()) throw new Error('応募前にプロフィールのお名前を保存してください。');
      await submitApplication(job.id, profile);
      window.location.assign('/applications');
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : '応募を送信できませんでした。');
    } finally {
      setApplying(false);
    }
  };
  return <article className="job-card">
    <div className="job-card-top"><div className="job-location"><Icon name="map" size={14} /> {job.prefecture || '地域未設定'} {job.city || ''}</div><button className={`heart-button ${saved ? 'saved' : ''}`} onClick={() => onToggleSaved(job.id)} aria-label={saved ? '気になるから削除' : '気になるに保存'}><Icon name="heart" size={18} /></button></div>
    <span className="facility-name">{job.facility_name}</span><h3>{job.title}</h3>
    <div className="job-tags">{job.employment_type && <span>{job.employment_type}</span>}{job.facility_type && <span>{job.facility_type}</span>}{job.verified_workplace?.verified_metric_count ? <span className="verified-tag">✓ Hoiku Office 実績</span> : null}{job.verified_finance?.verified_metric_count ? <span className="finance-verified-tag">✓ Hoiku Finance 実績</span> : null}</div>
    <div className="job-details"><span><Icon name="yen" size={16} /> {salaryLabel(job)}</span>{job.working_hours && <span><Icon name="clock" size={16} /> {job.working_hours}</span>}</div>
    {job.verified_workplace && <VerifiedWorkplaceSummary job={job} expanded={expanded} />}
    {job.verified_finance && <VerifiedFinanceSummary job={job} expanded={expanded} />}
    <p>{job.description}</p>
    {expanded && <div className="job-details"><span><strong>勤務地</strong> {job.address || `${job.prefecture || ''} ${job.city || ''}`}</span>{job.holidays && <span><strong>休日</strong> {job.holidays}</span>}{job.required_qualification && <span><strong>応募資格</strong> {job.required_qualification}</span>}{job.benefits && <span><strong>待遇</strong> {job.benefits}</span>}<span><strong>募集人数</strong> {job.number_of_positions}名</span></div>}
    {expanded && <VisitTrialPanel jobId={job.id} facilityId={job.facility_id} />}
    {applyError && <span className="form-error">{applyError}</span>}
    <div className="job-card-actions"><button className="secondary-button" type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? '詳細を閉じる' : '詳しく見る'}</button><button className="primary-button" type="button" onClick={apply} disabled={applying}>{applying ? '応募中…' : '応募する'} <Icon name="arrow" size={15} /></button></div>
  </article>;
}

function JobRow({ job, saved, onToggleSaved }: { job: Job; saved: boolean; onToggleSaved: (id: string) => void }) {
  return <article className="job-row"><div className="job-row-mark">{job.facility_name.slice(0, 1)}</div><div><strong>{job.title}</strong><small>{job.facility_name} ・ {job.prefecture || ''} {job.city || ''}{job.verified_workplace?.verified_metric_count ? ' ・ ✓ HO実績' : ''}{job.verified_finance?.verified_metric_count ? ' ・ ✓ HF実績' : ''}</small></div><span>{job.employment_type || '雇用形態未設定'}</span><span className="job-row-salary">{salaryLabel(job)}</span><button className={`heart-button ${saved ? 'saved' : ''}`} onClick={() => onToggleSaved(job.id)}><Icon name="heart" size={17} /></button></article>;
}

function VerifiedWorkplaceSummary({ job, expanded }: { job: Job; expanded: boolean }) {
  const profile = job.verified_workplace;
  if (!profile?.verified_metric_count) return null;
  const entries = verifiedPriority
    .map((key) => [key, profile.verified_metrics[key]] as const)
    .filter((entry): entry is readonly [string, VerifiedWorkplaceMetric] => Boolean(entry[1]?.value !== null && entry[1]?.value !== undefined))
    .slice(0, expanded ? 10 : 4);
  if (!entries.length) return null;
  return <section className="verified-workplace" aria-label="Hoiku Office実績データ">
    <div className="verified-workplace-head"><strong>✓ Hoiku Office 実績</strong><span>情報公開率 {Math.round(Number(profile.transparency_pct || 0))}%</span></div>
    <div className="verified-metric-grid">{entries.map(([key, metric]) => <div className="verified-metric" key={key}><span>{metric.label}</span><strong>{formatVerifiedMetric(metric)}</strong><small>実績 n={metric.sample_size}</small></div>)}</div>
    <small className="verified-period">集計期間 {formatMonth(profile.period_start)}〜{formatMonth(profile.period_end)} ・ 園の申告値ではなくHoiku Office実績から自動集計</small>
  </section>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}</label>; }
function EmptyState({ title, body, action, href }: { title: string; body: string; action?: string; href?: string }) { return <div className="empty-state"><span className="empty-icon"><Icon name="sparkles" /></span><h3>{title}</h3><p>{body}</p>{action && href && <a className="primary-button" href={href}>{action}</a>}</div>; }
function LoadingView() { return <div className="loading-view"><span className="loading-ring" /><strong>読み込んでいます</strong><p>求人・応募情報を確認しています。</p></div>; }
function csv(value: string) { return value.split(/[,、]/).map((v) => v.trim()).filter(Boolean); }
function formatDate(value: string) { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)); }
function formatMonth(value: string) { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : `${date.getFullYear()}年${date.getMonth() + 1}月`; }
function formatVerifiedMetric(metric: VerifiedWorkplaceMetric) { const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value; return `${value}${metric.unit || ''}`; }
function statusLabel(status: string) { return ({ new: '応募済み', applied: '応募済み', reviewing: '書類確認中', screening: '書類確認中', review: '確認中', interview: '面接予定', offered: '内定', offer: '内定', hired: '採用', rejected: '選考終了', withdrawn: '辞退' } as Record<string, string>)[status] || status; }
function salaryLabel(job: Job) { if (job.salary_note) return job.salary_note; if (job.salary_min && job.salary_max) return `${job.salary_type === 'hourly' ? '時給' : '月給'} ${job.salary_min.toLocaleString()}〜${job.salary_max.toLocaleString()}円`; if (job.salary_min) return `${job.salary_type === 'hourly' ? '時給' : '月給'} ${job.salary_min.toLocaleString()}円〜`; return '給与は求人詳細をご確認ください'; }
