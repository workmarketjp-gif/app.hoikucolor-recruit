import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './components/Icon';
import { ApplicationDetail } from './components/ApplicationDetail';
import { CandidateShell, type ShellTab } from './components/CandidateShell';
import { DocumentVaultPanel } from './components/DocumentVaultPanel';
import { EmptyState, InlineError, SectionHeader, SkeletonList, Toast } from './components/StateViews';
import { VisitTrialPanel } from './components/VisitTrialPanel';
import { VerifiedFinanceSummary } from './components/VerifiedFinanceSummary';
import { NotificationCenter } from './components/NotificationCenter';
import { getJobseekerAttentionSummary } from './lib/attentionRepository';
import { useCandidateSession } from './lib/candidateSession';
import {
  getJobSearchFacets, getProfile, getRankedJob, listApplications, listFeaturedJobs, listSavedJobIds,
  saveJob, searchJobs, submitApplication, unsaveJob, upsertProfile,
  type Application, type Job, type JobSearchCursor, type JobseekerProfile, type VerifiedWorkplaceMetric,
} from './lib/recruitRepository';
import { listSavedJobsWithStatus, type SavedJobWithStatus } from './lib/savedJobStatusRepository';
import { errorMessage, useResource } from './lib/useResource';

type View = ShellTab;
const applicationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const viewPaths: Record<View, string> = { home: '/', jobs: '/jobs', saved: '/saved', applications: '/applications', profile: '/profile' };
const viewTitles: Record<View, string> = { home: 'ホーム', jobs: '求人を探す', saved: '気になる', applications: '応募', profile: 'マイページ' };
const closedApplicationStatuses = ['rejected', 'withdrawn', 'hired'];

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

function jobIdFromLocation() {
  if (window.location.pathname.replace(/\/$/, '') !== '/jobs') return null;
  const value = new URLSearchParams(window.location.search).get('job_id');
  return value && applicationIdPattern.test(value) ? value : null;
}

function returnJobIdFromLocation() {
  if (!window.location.pathname.startsWith('/profile')) return null;
  const value = new URLSearchParams(window.location.search).get('return_job');
  return value && applicationIdPattern.test(value) ? value : null;
}

export function App() {
  const session = useCandidateSession();
  const [view, setView] = useState<View>(() => pathToView(window.location.pathname));
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(() => applicationIdFromLocation());
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);

  const userKey = session.userId;
  const savedIds = useResource(`saved-ids:${userKey}`, listSavedJobIds, '気になる求人を読み込めませんでした。');
  const applications = useResource(`applications:${userKey}`, listApplications, '応募情報を読み込めませんでした。');
  const profile = useResource(`profile:${userKey}`, getProfile, 'プロフィールを読み込めませんでした。');

  const refreshApplications = useCallback(async (surfaceError = false) => {
    try {
      applications.setData(await listApplications());
    } catch (err) {
      if (surfaceError) setToast({ message: errorMessage(err, '応募情報を更新できませんでした。'), tone: 'error' });
    }
  }, [applications.setData]);

  useEffect(() => {
    const onPop = () => {
      setView(pathToView(window.location.pathname));
      setSelectedApplicationId(applicationIdFromLocation());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshApplications(false);
    };
    const intervalId = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('hc:applications-refresh', refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('hc:applications-refresh', refreshWhenVisible);
    };
  }, [refreshApplications]);

  // Entering the applications list always shows the server's current state.
  useEffect(() => {
    if (view !== 'applications' || selectedApplicationId) return;
    void refreshApplications(true);
  }, [view, selectedApplicationId, refreshApplications]);

  const navigate = useCallback((next: View, search = '') => {
    window.history.pushState({}, '', `${viewPaths[next]}${search}`);
    setView(next); setSelectedApplicationId(null); window.scrollTo({ top: 0 });
  }, []);

  const openApplication = (applicationId: string) => {
    if (!applicationIdPattern.test(applicationId)) return;
    window.history.pushState({}, '', `/applications?application_id=${encodeURIComponent(applicationId)}`);
    setView('applications'); setSelectedApplicationId(applicationId); window.scrollTo({ top: 0 });
  };

  const closeApplication = () => {
    window.history.pushState({}, '', '/applications');
    setView('applications'); setSelectedApplicationId(null); window.scrollTo({ top: 0 });
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

  const savedIdList = savedIds.data ?? [];
  const toggleSaved = async (jobId: string) => {
    const wasSaved = savedIdList.includes(jobId);
    savedIds.setData(wasSaved ? savedIdList.filter((id) => id !== jobId) : [jobId, ...savedIdList]);
    try {
      if (wasSaved) await unsaveJob(jobId); else await saveJob(jobId, session.userId);
      setToast({ message: wasSaved ? '気になるから外しました' : '気になるに保存しました', tone: 'info' });
      window.dispatchEvent(new CustomEvent('hc:saved-refresh'));
    } catch (err) {
      savedIds.setData(savedIdList);
      setToast({ message: errorMessage(err, '保存状態を更新できませんでした。'), tone: 'error' });
    }
  };

  const startApplication = (jobId: string) => navigate('profile', `?return_job=${encodeURIComponent(jobId)}`);

  const displayName = profile.data?.name || session.firstName || session.fullName || 'ゲスト';
  const activeApplications = (applications.data ?? []).filter((a) => !closedApplicationStatuses.includes(a.status)).length;
  const title = view === 'applications' && selectedApplicationId ? '応募の詳細' : viewTitles[view];

  return (
    <CandidateShell
      active={view}
      title={title}
      name={displayName}
      email={session.email}
      badges={{ saved: savedIdList.length, applications: activeApplications }}
      onNavigate={(tab) => navigate(tab)}
      onSignOut={session.signOut}
      notification={<NotificationCenter onNavigate={navigateTarget} />}
    >
      {view === 'home' && (
        <HomeView
          name={displayName}
          savedCount={savedIds}
          applications={applications}
          savedIds={savedIdList}
          onNavigate={navigate}
          onToggleSaved={toggleSaved}
          onStartApplication={startApplication}
        />
      )}
      {view === 'jobs' && <JobsView savedIds={savedIdList} onToggleSaved={toggleSaved} onStartApplication={startApplication} />}
      {view === 'saved' && <SavedView onToggleSaved={toggleSaved} onStartApplication={startApplication} onNavigate={navigate} />}
      {view === 'applications' && (selectedApplicationId
        ? <ApplicationDetail applicationId={selectedApplicationId} onBack={closeApplication} />
        : <ApplicationsView applications={applications} onOpen={openApplication} onNavigate={navigate} />)}
      {view === 'profile' && (
        <ProfileView
          profileResource={profile}
          fallback={{ userId: session.userId, email: session.email, name: session.fullName }}
          onSaved={(next) => {
            profile.setData(next);
            const returnJob = returnJobIdFromLocation();
            if (returnJob) {
              setToast({ message: 'プロフィールを保存しました。求人に戻ります。', tone: 'info' });
              navigate('jobs', `?job_id=${encodeURIComponent(returnJob)}`);
            }
          }}
        />
      )}
      <Toast message={toast?.message ?? null} tone={toast?.tone} onClose={closeToast} />
    </CandidateShell>
  );
}

/* ---------------------------------- Home ---------------------------------- */

type ResourceLike<T> = ReturnType<typeof useResource<T>>;

function HomeView({ name, savedCount, applications, savedIds, onNavigate, onToggleSaved, onStartApplication }: {
  name: string;
  savedCount: ResourceLike<string[]>;
  applications: ResourceLike<Application[]>;
  savedIds: string[];
  onNavigate: (v: View, search?: string) => void;
  onToggleSaved: (id: string) => void;
  onStartApplication: (jobId: string) => void;
}) {
  const featured = useResource('featured', () => listFeaturedJobs(3), 'おすすめ求人を読み込めませんでした。');
  const attention = useResource('attention', getJobseekerAttentionSummary, '新着メッセージを読み込めませんでした。');

  useEffect(() => {
    const onRefresh = () => attention.reload();
    window.addEventListener('hc:attention-refresh', onRefresh);
    return () => window.removeEventListener('hc:attention-refresh', onRefresh);
  }, [attention.reload]);

  const inProgress = applications.data ? applications.data.filter((a) => !closedApplicationStatuses.includes(a.status)).length : null;
  const pendingInterviews = attention.data?.unanswered_interviews_count ?? 0;
  const pendingScouts = attention.data?.pending_scouts_count ?? 0;

  return (
    <div className="hc-home">
      <p className="hc-greeting">こんにちは、{name}さん</p>
      <button type="button" className="hc-cta" onClick={() => onNavigate('jobs')}>
        <Icon name="search" size={20} /> 求人を探す
      </button>

      <div className="hc-stat-list">
        <StatRow label="気になる園" icon="heart" resource={savedCount} value={savedCount.data?.length ?? null} onOpen={() => onNavigate('saved')} />
        <StatRow label="応募中" icon="briefcase" resource={applications} value={inProgress} onOpen={() => onNavigate('applications')} />
        <StatRow label="新着メッセージ" icon="bell" resource={attention} value={attention.data?.unread_messages_count ?? null} href={attention.data?.next_message ? `/applications?application_id=${encodeURIComponent(attention.data.next_message.application_id)}#application-messages` : undefined} onOpen={() => onNavigate('applications')} />
      </div>

      {(pendingInterviews > 0 || pendingScouts > 0) && (
        <div className="hc-todo">
          {pendingInterviews > 0 && <a className="hc-todo-item" href="/applications">面接の回答待ち <strong>{pendingInterviews}件</strong><Icon name="chevron" size={16} /></a>}
          {pendingScouts > 0 && <a className="hc-todo-item" href="/scouts">届いたスカウト <strong>{pendingScouts}件</strong><Icon name="chevron" size={16} /></a>}
        </div>
      )}

      <section className="hc-section">
        <SectionHeader title="おすすめ求人" action={<button type="button" className="hc-link-button" onClick={() => onNavigate('jobs')}>すべて見る</button>} />
        {featured.status === 'error' && <InlineError message={featured.error} onRetry={featured.reload} />}
        {featured.status === 'loading' && !featured.data && <SkeletonList rows={2} />}
        {featured.data && (featured.data.jobs.length
          ? <div className="hc-job-list">{featured.data.jobs.map((job) => <JobCard key={job.id} job={job} saved={savedIds.includes(job.id)} onToggleSaved={onToggleSaved} onStartApplication={onStartApplication} />)}</div>
          : <EmptyState title="公開中の求人はまだありません" body="園から求人が公開されると、ここに表示されます。" />)}
      </section>
    </div>
  );
}

function StatRow({ label, icon, resource, value, href, onOpen }: {
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  resource: { status: string; reload: () => void };
  value: number | null;
  href?: string;
  onOpen: () => void;
}) {
  const body = (
    <>
      <span className="hc-stat-icon"><Icon name={icon} size={20} /></span>
      <span className="hc-stat-label">{label}</span>
      {resource.status === 'error' && value === null
        ? <span className="hc-stat-error">読み込めませんでした</span>
        : <strong className="hc-stat-value">{value === null ? '…' : value}</strong>}
      <Icon name="chevron" size={16} />
    </>
  );
  if (resource.status === 'error' && value === null) {
    return <button type="button" className="hc-stat-row is-error" onClick={resource.reload} aria-label={`${label}をもう一度読み込む`}>{body}</button>;
  }
  if (href) return <a className="hc-stat-row" href={href}>{body}</a>;
  return <button type="button" className="hc-stat-row" onClick={onOpen}>{body}</button>;
}

/* ---------------------------------- Jobs ---------------------------------- */

function JobsView({ savedIds, onToggleSaved, onStartApplication }: { savedIds: string[]; onToggleSaved: (id: string) => void; onStartApplication: (jobId: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [prefecture, setPrefecture] = useState('');
  const [employment, setEmployment] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [financeVerifiedOnly, setFinanceVerifiedOnly] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cursor, setCursor] = useState<JobSearchCursor | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const facets = useResource('job-facets', () => getJobSearchFacets(), '絞り込み条件を読み込めませんでした。');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setStatus('loading');
      setSearchError(null);
      setLoadMoreError(null);
      const targetJobId = !keyword.trim() && !prefecture && !employment && !verifiedOnly && !financeVerifiedOnly ? jobIdFromLocation() : null;
      Promise.all([
        searchJobs({ keyword, prefecture, employmentType: employment, hoVerifiedOnly: verifiedOnly, hfVerifiedOnly: financeVerifiedOnly, limit: 24 }),
        targetJobId ? getRankedJob(targetJobId) : Promise.resolve(null),
      ])
        .then(([page, targetJob]) => {
          if (!active) return;
          const pageJobs = targetJob && !page.jobs.some((job) => job.id === targetJob.id) ? [targetJob, ...page.jobs] : page.jobs;
          setJobs(pageJobs);
          setTotalCount(page.totalCount);
          setHasMore(page.hasMore);
          setCursor(page.nextCursor);
          setStatus('success');
        })
        .catch((err) => {
          if (!active) return;
          setSearchError(errorMessage(err, '求人を検索できませんでした。'));
          setStatus('error');
        });
    }, keyword.trim() ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [keyword, prefecture, employment, verifiedOnly, financeVerifiedOnly, attempt]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await searchJobs({ keyword, prefecture, employmentType: employment, hoVerifiedOnly: verifiedOnly, hfVerifiedOnly: financeVerifiedOnly, limit: 24, cursor });
      setJobs((prev) => [...prev, ...page.jobs.filter((job) => !prev.some((existing) => existing.id === job.id))]);
      setTotalCount(page.totalCount);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadMoreError(errorMessage(err, '次の求人を読み込めませんでした。'));
    } finally {
      setLoadingMore(false);
    }
  };

  const hasFilters = Boolean(keyword.trim() || prefecture || employment || verifiedOnly || financeVerifiedOnly);
  const clearFilters = () => { setKeyword(''); setPrefecture(''); setEmployment(''); setVerifiedOnly(false); setFinanceVerifiedOnly(false); };

  return (
    <div className="hc-jobs">
      <label className="hc-search">
        <Icon name="search" size={20} />
        <input type="search" inputMode="search" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="園名・職種・地域で検索" aria-label="キーワード検索" />
      </label>

      <div className="hc-filter-row" role="group" aria-label="絞り込み">
        <label className={`hc-chip-select ${prefecture ? 'is-active' : ''}`}>
          <span className="hc-visually-hidden">勤務地</span>
          <select value={prefecture} onChange={(e) => setPrefecture(e.target.value)} aria-label="勤務地">
            <option value="">勤務地</option>
            {(facets.data?.prefectures ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className={`hc-chip-select ${employment ? 'is-active' : ''}`}>
          <span className="hc-visually-hidden">雇用形態</span>
          <select value={employment} onChange={(e) => setEmployment(e.target.value)} aria-label="雇用形態">
            <option value="">雇用形態</option>
            {(facets.data?.employmentTypes ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <button type="button" className={`hc-chip ${verifiedOnly ? 'is-active' : ''}`} aria-pressed={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)}>HO実績データあり</button>
        <button type="button" className={`hc-chip ${financeVerifiedOnly ? 'is-active' : ''}`} aria-pressed={financeVerifiedOnly} onClick={() => setFinanceVerifiedOnly((v) => !v)}>HF実績データあり</button>
      </div>
      {facets.status === 'error' && <InlineError message={facets.error} onRetry={facets.reload} compact />}

      <div className="hc-result-bar">
        <strong aria-live="polite">{status === 'success' ? `${totalCount}件` : status === 'loading' ? '検索中…' : ''}</strong>
        {hasFilters && <button type="button" className="hc-link-button" onClick={clearFilters}>条件をクリア</button>}
      </div>

      {status === 'error' && <InlineError message={searchError || '求人を検索できませんでした。'} onRetry={() => setAttempt((v) => v + 1)} />}
      {status === 'loading' && !jobs.length && <SkeletonList rows={3} />}
      {status === 'success' && !jobs.length && <EmptyState title="条件に合う求人はありません" body="条件を変えて、もう一度探してみてください。" action={hasFilters ? '条件をクリア' : undefined} onAction={hasFilters ? clearFilters : undefined} />}
      {jobs.length > 0 && status !== 'error' && (
        <div className="hc-job-list" aria-busy={status === 'loading'}>
          {jobs.map((job) => <JobCard key={job.id} job={job} saved={savedIds.includes(job.id)} onToggleSaved={onToggleSaved} onStartApplication={onStartApplication} />)}
        </div>
      )}
      {loadMoreError && <InlineError message={loadMoreError} onRetry={loadMore} />}
      {hasMore && status === 'success' && (
        <button className="secondary-button hc-load-more" type="button" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? '読み込み中…' : `さらに見る（${Math.min(jobs.length, totalCount)}/${totalCount}件）`}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------- Saved --------------------------------- */

function SavedView({ onToggleSaved, onStartApplication, onNavigate }: { onToggleSaved: (id: string) => void; onStartApplication: (jobId: string) => void; onNavigate: (v: View) => void }) {
  const saved = useResource<SavedJobWithStatus[]>('saved-jobs', () => listSavedJobsWithStatus(), '気になる求人を読み込めませんでした。');
  useEffect(() => {
    const onRefresh = () => saved.reload();
    window.addEventListener('hc:saved-refresh', onRefresh);
    return () => window.removeEventListener('hc:saved-refresh', onRefresh);
  }, [saved.reload]);

  return (
    <div className="hc-saved">
      {saved.status === 'error' && <InlineError message={saved.error} onRetry={saved.reload} />}
      {saved.status === 'loading' && !saved.data && <SkeletonList rows={2} />}
      {saved.data && (saved.data.length
        ? <>
            <div className="hc-result-bar"><strong>{saved.data.length}件</strong>{saved.data.length >= 2 && <a className="hc-link-button" href={`/compare?${saved.data.slice(0, 3).map((job) => `job_id=${encodeURIComponent(job.id)}`).join('&')}`}>園を比較する</a>}</div>
            <div className="hc-job-list">{saved.data.map((job) => <JobCard key={job.id} job={job} saved onToggleSaved={onToggleSaved} onStartApplication={onStartApplication} />)}</div>
          </>
        : <EmptyState title="気になる求人はまだありません" body="求人の♡を押すと、ここに保存されます。" action="求人を探す" onAction={() => onNavigate('jobs')} />)}
    </div>
  );
}

/* ------------------------------ Applications ------------------------------ */

function ApplicationsView({ applications, onOpen, onNavigate }: { applications: ResourceLike<Application[]>; onOpen: (applicationId: string) => void; onNavigate: (v: View) => void }) {
  return (
    <div className="hc-applications">
      {applications.status === 'error' && <InlineError message={applications.error} onRetry={applications.reload} />}
      {applications.status === 'loading' && !applications.data && <SkeletonList rows={2} />}
      {applications.data && (applications.data.length
        ? <div className="hc-application-list">
            {applications.data.map((app) => (
              <button type="button" className="hc-application-row" key={app.id} onClick={() => onOpen(app.id)} aria-label={`${app.facility_name} ${app.job_title}の応募詳細を開く`}>
                <span className={`status-badge status-${app.status}`}>{statusLabel(app.status)}</span>
                <strong>{app.facility_name || '園'}</strong>
                <span>{app.job_title || '求人'}</span>
                <small>応募日 {formatDate(app.applied_at)}</small>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        : <EmptyState title="応募はまだありません" body="気になる園を見つけたら、求人から応募できます。" action="求人を探す" onAction={() => onNavigate('jobs')} />)}
    </div>
  );
}

/* --------------------------------- Profile -------------------------------- */

const positionOptions = ['保育士', '保育教諭', '幼稚園教諭', '保育補助', '看護師', '栄養士', '調理師', '児童指導員', '子育て支援員'];
const employmentOptions = ['正社員', '契約社員', 'パート・アルバイト', '派遣'];
const qualificationOptions = ['保育士', '幼稚園教諭', '保育教諭', '看護師', '准看護師', '栄養士', '管理栄養士', '調理師', '子育て支援員'];
const prefectureOptions = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];

function ProfileView({ profileResource, fallback, onSaved }: {
  profileResource: ResourceLike<JobseekerProfile | null>;
  fallback: { userId: string; email: string | null; name: string | null };
  onSaved: (profile: JobseekerProfile) => void;
}) {
  const returnJob = returnJobIdFromLocation();

  if (profileResource.status === 'error' && !profileResource.data) {
    return <InlineError message={profileResource.error} onRetry={profileResource.reload} />;
  }
  if (profileResource.status === 'loading' && profileResource.data === null) return <SkeletonList rows={2} />;

  const initial: JobseekerProfile = profileResource.data || {
    clerk_user_id: fallback.userId,
    email: fallback.email,
    name: fallback.name,
    name_kana: null, phone: null, prefecture: null,
    desired_positions: [], desired_employment_types: [], qualifications: [],
    years_of_experience: null, desired_start_date: null, self_intro: null,
  };

  return (
    <div className="hc-profile">
      {returnJob && <p className="hc-notice">応募に必要な項目を入力して保存すると、求人に戻ります。</p>}
      {!returnJob && (
        <nav className="hc-menu" aria-label="その他のメニュー">
          <a href="/scouts">スカウト<Icon name="chevron" size={16} /></a>
          <a href="/visits">見学・体験の予約<Icon name="chevron" size={16} /></a>
          <a href="/spot-jobs">スポット勤務<Icon name="chevron" size={16} /></a>
          <a href="/matches">マッチ度を見る<Icon name="chevron" size={16} /></a>
          <a href="/compare">園を比較する<Icon name="chevron" size={16} /></a>
        </nav>
      )}
      <ProfileForm key={initial.clerk_user_id} initial={initial} requireForApplication={Boolean(returnJob)} onSaved={onSaved} />
      <DocumentVaultPanel />
    </div>
  );
}

function ProfileForm({ initial, requireForApplication, onSaved }: { initial: JobseekerProfile; requireForApplication: boolean; onSaved: (p: JobseekerProfile) => void }) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof JobseekerProfile>(key: K, value: JobseekerProfile[K]) => { setSaved(false); setDraft((p) => ({ ...p, [key]: value })); };
  const missingName = !draft.name?.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (missingName) { setError('お名前を入力してください。'); return; }
    setSaving(true); setSaved(false); setError(null);
    try { await upsertProfile(draft); setSaved(true); onSaved(draft); }
    catch (err) { setError(errorMessage(err, '保存できませんでした。')); }
    finally { setSaving(false); }
  };

  return (
    <form className="hc-form" onSubmit={submit} noValidate>
      <section className="hc-form-section">
        <h2>基本情報</h2>
        <Field label="お名前" required><input value={draft.name || ''} onChange={(e) => update('name', e.target.value)} autoComplete="name" aria-invalid={requireForApplication && missingName} /></Field>
        <Field label="フリガナ"><input value={draft.name_kana || ''} onChange={(e) => update('name_kana', e.target.value)} /></Field>
        <Field label="メールアドレス"><input type="email" inputMode="email" autoComplete="email" value={draft.email || ''} onChange={(e) => update('email', e.target.value)} /></Field>
        <Field label="電話番号"><input type="tel" inputMode="tel" autoComplete="tel" value={draft.phone || ''} onChange={(e) => update('phone', e.target.value)} /></Field>
        <Field label="お住まいの都道府県">
          <select value={draft.prefecture || ''} onChange={(e) => update('prefecture', e.target.value || null)}>
            <option value="">選択してください</option>
            {[...new Set([...(draft.prefecture && !prefectureOptions.includes(draft.prefecture) ? [draft.prefecture] : []), ...prefectureOptions])].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="保育経験年数"><input type="number" inputMode="decimal" min="0" step="0.5" value={draft.years_of_experience ?? ''} onChange={(e) => update('years_of_experience', e.target.value ? Number(e.target.value) : null)} /></Field>
      </section>

      <section className="hc-form-section">
        <h2>希望条件</h2>
        <ChipGroup label="希望職種" options={positionOptions} values={draft.desired_positions} onChange={(v) => update('desired_positions', v)} />
        <ChipGroup label="希望雇用形態" options={employmentOptions} values={draft.desired_employment_types} onChange={(v) => update('desired_employment_types', v)} />
        <ChipGroup label="資格" options={qualificationOptions} values={draft.qualifications} onChange={(v) => update('qualifications', v)} />
        <Field label="勤務開始希望日"><input type="date" value={draft.desired_start_date || ''} onChange={(e) => update('desired_start_date', e.target.value || null)} /></Field>
        <Field label="自己紹介"><textarea rows={4} value={draft.self_intro || ''} onChange={(e) => update('self_intro', e.target.value)} placeholder="大切にしている保育や、これまでの経験など" /></Field>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      {saved && <p className="form-success" role="status">保存しました</p>}
      <button className="primary-button hc-submit" disabled={saving}>{saving ? '保存中…' : requireForApplication ? '保存して求人に戻る' : '保存する'}</button>
    </form>
  );
}

function ChipGroup({ label, options, values, onChange }: { label: string; options: string[]; values: string[]; onChange: (values: string[]) => void }) {
  const all = [...new Set([...options, ...values])];
  const toggle = (option: string) => onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);
  return (
    <fieldset className="hc-chip-group">
      <legend>{label}</legend>
      <div>{all.map((option) => <button key={option} type="button" className={`hc-chip ${values.includes(option) ? 'is-active' : ''}`} aria-pressed={values.includes(option)} onClick={() => toggle(option)}>{option}</button>)}</div>
    </fieldset>
  );
}

/* --------------------------------- Job card ------------------------------- */

function JobCard({ job, saved, onToggleSaved, onStartApplication }: { job: Job; saved: boolean; onToggleSaved: (id: string) => void; onStartApplication: (jobId: string) => void }) {
  const [expanded, setExpanded] = useState(() => jobIdFromLocation() === job.id);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const isClosed = (job as Partial<SavedJobWithStatus>).is_open === false || Boolean(job.closing_at && new Date(job.closing_at).getTime() < Date.now());
  const location = [job.prefecture, job.city].filter(Boolean).join(' ') || '勤務地は詳細をご確認ください';

  const apply = async () => {
    if (isClosed) { setApplyError('この求人は募集を終了しています。'); return; }
    setApplying(true); setApplyError(null);
    try {
      const profile = await getProfile();
      if (!profile?.name?.trim()) { onStartApplication(job.id); return; }
      await submitApplication(job.id, profile);
      window.location.assign('/applications');
    } catch (err) {
      setApplyError(errorMessage(err, '応募を送信できませんでした。'));
    } finally {
      setApplying(false);
    }
  };

  return (
    <article className={`hc-job-card ${expanded ? 'is-expanded' : ''}`} data-job-id={job.id}>
      <header className="hc-job-head">
        <div className="hc-job-identity">
          <span className="hc-job-facility">{job.facility_name}</span>
          <h3>{job.title}</h3>
        </div>
        <button type="button" className={`heart-button ${saved ? 'saved' : ''}`} onClick={() => onToggleSaved(job.id)} aria-label={saved ? '気になるから外す' : '気になるに保存'} aria-pressed={saved}><Icon name="heart" size={22} /></button>
      </header>
      <p className="hc-job-salary">{salaryLabel(job)}</p>
      <p className="hc-job-meta"><Icon name="map" size={16} /> {location}{job.employment_type ? ` ・ ${job.employment_type}` : ''}</p>
      <div className="hc-job-tags">
        {isClosed && <span className="status-badge status-rejected">募集終了</span>}
        {job.verified_workplace?.verified_metric_count ? <span className="verified-tag">✓ Hoiku Office 実績</span> : null}
        {job.verified_finance?.verified_metric_count ? <span className="finance-verified-tag">✓ Hoiku Finance 実績</span> : null}
      </div>

      {expanded && (
        <div className="hc-job-detail">
          <section><h4>園</h4><p>{job.facility_name}{job.facility_type ? `（${job.facility_type}）` : ''}</p><p>{job.address || location}</p></section>
          <section><h4>条件</h4>
            <dl>
              <dt>給与</dt><dd>{salaryLabel(job)}</dd>
              {job.employment_type && <><dt>雇用形態</dt><dd>{job.employment_type}</dd></>}
              {job.working_hours && <><dt>勤務時間</dt><dd>{job.working_hours}</dd></>}
              {job.holidays && <><dt>休日</dt><dd>{job.holidays}</dd></>}
              {job.required_qualification && <><dt>応募資格</dt><dd>{job.required_qualification}</dd></>}
              {job.benefits && <><dt>待遇</dt><dd>{job.benefits}</dd></>}
              <dt>募集人数</dt><dd>{job.number_of_positions}名</dd>
            </dl>
          </section>
          {(job.verified_workplace || job.verified_finance) && (
            <section><h4>実際の働き方</h4>
              {job.verified_workplace && <VerifiedWorkplaceSummary job={job} expanded={expanded} />}
              {job.verified_finance && <VerifiedFinanceSummary job={job} expanded={expanded} />}
            </section>
          )}
          {job.description && <section><h4>仕事内容・保育観</h4><p className="hc-job-description">{job.description}</p></section>}
          {!isClosed && <VisitTrialPanel jobId={job.id} facilityId={job.facility_id} />}
          {isClosed && <p className="form-error">募集は終了しています。保存履歴として求人内容を確認できます。</p>}
        </div>
      )}

      {applyError && <p className="form-error" role="alert">{applyError}</p>}
      <div className="hc-job-actions">
        <button className="secondary-button" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? '閉じる' : '詳しく見る'}</button>
        <button className="primary-button" type="button" onClick={apply} disabled={applying || isClosed}>{isClosed ? '募集終了' : applying ? '応募中…' : '応募する'}</button>
      </div>
    </article>
  );
}

function VerifiedWorkplaceSummary({ job, expanded }: { job: Job; expanded: boolean }) {
  const profile = job.verified_workplace;
  const entries = useMemo(() => profile?.verified_metric_count
    ? verifiedPriority
      .map((key) => [key, profile.verified_metrics[key]] as const)
      .filter((entry): entry is readonly [string, VerifiedWorkplaceMetric] => Boolean(entry[1]?.value !== null && entry[1]?.value !== undefined))
      .slice(0, expanded ? 10 : 4)
    : [], [profile, expanded]);
  if (!profile?.verified_metric_count || !entries.length) return null;
  return <section className="verified-workplace" aria-label="Hoiku Office実績データ">
    <div className="verified-workplace-head"><strong>✓ Hoiku Office 実績</strong><span>情報公開率 {Math.round(Number(profile.transparency_pct || 0))}%</span></div>
    <div className="verified-metric-grid">{entries.map(([key, metric]) => <div className="verified-metric" key={key}><span>{metric.label}</span><strong>{formatVerifiedMetric(metric)}</strong><small>実績 n={metric.sample_size}</small></div>)}</div>
    <small className="verified-period">集計期間 {formatMonth(profile.period_start)}〜{formatMonth(profile.period_end)} ・ 園の申告値ではなくHoiku Office実績から自動集計</small>
  </section>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="hc-field"><span>{label}{required && <em className="hc-required">必須</em>}</span>{children}</label>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)); }
function formatMonth(value: string) { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : `${date.getFullYear()}年${date.getMonth() + 1}月`; }
function formatVerifiedMetric(metric: VerifiedWorkplaceMetric) { const value = typeof metric.value === 'number' ? Number(metric.value.toFixed(1)) : metric.value; return `${value}${metric.unit || ''}`; }
function statusLabel(status: string) { return ({ new: '応募済み', applied: '応募済み', reviewing: '書類確認中', screening: '書類確認中', review: '確認中', interview: '面接予定', offered: '内定', offer: '内定', hired: '採用', rejected: '選考終了', withdrawn: '辞退' } as Record<string, string>)[status] || status; }
function salaryLabel(job: Job) { if (job.salary_note) return job.salary_note; if (job.salary_min && job.salary_max) return `${job.salary_type === 'hourly' ? '時給' : '月給'} ${job.salary_min.toLocaleString()}〜${job.salary_max.toLocaleString()}円`; if (job.salary_min) return `${job.salary_type === 'hourly' ? '時給' : '月給'} ${job.salary_min.toLocaleString()}円〜`; return '給与は詳細をご確認ください'; }
