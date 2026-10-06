import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { ApplicationDetail } from './components/ApplicationDetail';
import { CandidateShell, type ShellTab } from './components/CandidateShell';
import { DocumentVaultPanel } from './components/DocumentVaultPanel';
import { JobCard } from './components/JobCard';
import { RankingDisclosure, rankLabels } from './components/RankingDisclosure';
import { EmptyState, InlineError, SectionHeader, SkeletonList, Toast } from './components/StateViews';
import { NotificationCenter } from './components/NotificationCenter';
import { getJobseekerAttentionSummary } from './lib/attentionRepository';
import { useCandidateSession } from './lib/candidateSession';
import {
  getJobSearchFacets, getProfile, getRankedJob, listApplications, listFeaturedJobs, listSavedJobIds,
  saveJob, searchJobs, unsaveJob, upsertProfile,
  type Application, type Job, type JobSearchCursor, type JobseekerProfile,
} from './lib/recruitRepository';
import { pathToView, restoreReturnTarget, useInAppLinks, uuidParam, uuidPattern, viewPaths, type View } from './lib/router';
import { listSavedJobsWithStatus, type SavedJobWithStatus } from './lib/savedJobStatusRepository';
import { errorMessage, useResource } from './lib/useResource';
import './views/views.css';

// Secondary screens load on first visit so Home / search stay light.
const CompareView = lazy(() => import('./views/CompareView').then((module) => ({ default: module.CompareView })));
const MatchesView = lazy(() => import('./views/MatchesView').then((module) => ({ default: module.MatchesView })));
const ScoutsView = lazy(() => import('./views/ScoutsView').then((module) => ({ default: module.ScoutsView })));
const SpotJobsView = lazy(() => import('./views/SpotJobsView').then((module) => ({ default: module.SpotJobsView })));
const VisitsView = lazy(() => import('./views/VisitsView').then((module) => ({ default: module.VisitsView })));

const viewTitles: Record<View, string> = {
  home: 'ホーム',
  jobs: '求人を探す',
  saved: '気になる',
  applications: '応募',
  profile: 'マイページ',
  scouts: 'スカウト',
  visits: '見学・体験',
  spot: 'スポット勤務',
  matches: 'マッチ度',
  compare: '園を比較',
};

/** Which bottom tab a screen belongs to. Secondary screens keep their parent tab lit. */
const parentTab: Record<View, ShellTab> = {
  home: 'home',
  jobs: 'jobs',
  saved: 'saved',
  applications: 'applications',
  profile: 'profile',
  scouts: 'profile',
  visits: 'profile',
  spot: 'jobs',
  matches: 'jobs',
  compare: 'saved',
};

const secondaryViews = new Set<View>(['scouts', 'visits', 'spot', 'matches', 'compare']);
const closedApplicationStatuses = ['rejected', 'withdrawn', 'hired'];

type Route = { view: View; applicationId: string | null; key: number };

function readRoute(key: number): Route {
  return {
    view: pathToView(window.location.pathname) ?? 'home',
    applicationId: uuidParam('applications', 'application_id'),
    key,
  };
}

function jobIdFromLocation() {
  if (window.location.pathname.replace(/\/$/, '') !== '/jobs') return null;
  return uuidParam('jobs', 'job_id');
}

function returnJobIdFromLocation() {
  return uuidParam('profile', 'return_job');
}

function historyDepth() {
  const state = window.history.state as { hcDepth?: number } | null;
  return typeof state?.hcDepth === 'number' ? state.hcDepth : 0;
}

export function App() {
  const session = useCandidateSession();
  const [route, setRoute] = useState<Route>(() => {
    // A deep link opened while signed out comes back here after login.
    restoreReturnTarget();
    if (!pathToView(window.location.pathname)) window.history.replaceState(window.history.state, '', '/');
    return readRoute(0);
  });
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const { view, applicationId: selectedApplicationId } = route;

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

  /** Navigate to any in-app URL (path + query + anchor). Other URLs leave the app. */
  const navigateTo = useCallback((target: string) => {
    let url: URL;
    try {
      url = new URL(target, window.location.origin);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin || !pathToView(url.pathname)) {
      window.location.assign(url.href);
      return;
    }
    window.history.pushState({ hcDepth: historyDepth() + 1 }, '', `${url.pathname}${url.search}${url.hash}`);
    setRoute((current) => readRoute(current.key + 1));
    if (!url.hash) window.scrollTo({ top: 0 });
  }, []);

  const navigate = useCallback((next: View, search = '') => navigateTo(`${viewPaths[next]}${search}`), [navigateTo]);
  useInAppLinks(navigateTo);

  useEffect(() => {
    const onPop = () => setRoute((current) => readRoute(current.key + 1));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Plain in-page anchors (e.g. /scouts#scout-settings). Screens with data-dependent
  // targets (messages, interviews, scouts, visits, spot shifts) focus those themselves.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id || !/^[a-z0-9-]+$/i.test(id)) return;
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 0);
    return () => window.clearTimeout(timer);
  }, [route.key]);

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

  const openApplication = (applicationId: string) => navigate('applications', `?application_id=${encodeURIComponent(applicationId)}`);

  /** Back within the app when there is in-app history, otherwise to the parent screen. */
  const goBack = useCallback(() => {
    if (historyDepth() > 0) {
      window.history.back();
      return;
    }
    navigate(view === 'applications' ? 'applications' : view === 'compare' ? 'saved' : 'home');
  }, [navigate, view]);

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

  const applied = (applicationId: string) => {
    setToast({ message: '応募しました。園からの連絡をお待ちください。', tone: 'info' });
    void refreshApplications(false);
    openApplication(applicationId);
  };

  const jobActions: JobActions = { onToggleSaved: toggleSaved, onStartApplication: startApplication, onApplied: applied };

  const displayName = profile.data?.name || session.firstName || session.fullName || 'ゲスト';
  const activeApplications = (applications.data ?? []).filter((a) => !closedApplicationStatuses.includes(a.status)).length;
  const isDetail = view === 'applications' && Boolean(selectedApplicationId);
  const title = isDetail ? '応募の詳細' : viewTitles[view];

  return (
    <CandidateShell
      active={parentTab[view]}
      title={title}
      name={displayName}
      email={session.email}
      badges={{ saved: savedIdList.length, applications: activeApplications }}
      onNavigate={(tab) => navigate(tab)}
      onBack={isDetail || secondaryViews.has(view) ? goBack : undefined}
      onSignOut={session.signOut}
      notification={<NotificationCenter onNavigate={navigateTo} />}
    >
      <div className="hc-route" key={route.key}>
        {view === 'home' && (
          <HomeView
            name={displayName}
            savedCount={savedIds}
            applications={applications}
            savedIds={savedIdList}
            onNavigate={navigate}
            {...jobActions}
          />
        )}
        {view === 'jobs' && <JobsView savedIds={savedIdList} {...jobActions} />}
        {view === 'saved' && <SavedView onNavigate={navigate} {...jobActions} />}
        {view === 'applications' && (selectedApplicationId
          ? <ApplicationDetail applicationId={selectedApplicationId} onBack={goBack} />
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
        {secondaryViews.has(view) && (
          <Suspense fallback={<SkeletonList rows={2} />}>
            {view === 'scouts' && <ScoutsView />}
            {view === 'visits' && <VisitsView />}
            {view === 'spot' && <SpotJobsView onStartApplication={() => navigate('profile')} />}
            {view === 'matches' && <MatchesView userKey={userKey} savedIds={savedIdList} {...jobActions} />}
            {view === 'compare' && <CompareView userKey={userKey} />}
          </Suspense>
        )}
      </div>
      <Toast message={toast?.message ?? null} tone={toast?.tone} onClose={closeToast} />
    </CandidateShell>
  );
}

/* ---------------------------------- Home ---------------------------------- */

type ResourceLike<T> = ReturnType<typeof useResource<T>>;

type JobActions = {
  onToggleSaved: (id: string) => void;
  onStartApplication: (jobId: string) => void;
  onApplied: (applicationId: string) => void;
};

function HomeView({ name, savedCount, applications, savedIds, onNavigate, ...jobActions }: {
  name: string;
  savedCount: ResourceLike<string[]>;
  applications: ResourceLike<Application[]>;
  savedIds: string[];
  onNavigate: (v: View, search?: string) => void;
} & JobActions) {
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
  const nextInterview = attention.data?.next_interview;
  const interviewHref = nextInterview && uuidPattern.test(nextInterview.application_id) && uuidPattern.test(nextInterview.interview_id)
    ? `/applications?application_id=${encodeURIComponent(nextInterview.application_id)}&interview_id=${encodeURIComponent(nextInterview.interview_id)}#interview-${nextInterview.interview_id}`
    : '/applications';

  return (
    <div className="hc-home">
      <p className="hc-greeting">こんにちは、{name}さん</p>
      <button type="button" className="hc-cta" onClick={() => onNavigate('jobs')}>
        <Icon name="search" size={20} /> 求人を探す
      </button>

      <div className="hc-stat-list">
        <StatRow label="気になる園" icon="heart" resource={savedCount} value={savedCount.data?.length ?? null} onOpen={() => onNavigate('saved')} />
        <StatRow label="応募中" icon="briefcase" resource={applications} value={inProgress} onOpen={() => onNavigate('applications')} />
        <StatRow label="新着メッセージ" icon="bell" resource={attention} value={attention.data?.unread_messages_count ?? null} href={attention.data?.next_message && uuidPattern.test(attention.data.next_message.application_id) ? `/applications?application_id=${encodeURIComponent(attention.data.next_message.application_id)}#application-messages` : undefined} onOpen={() => onNavigate('applications')} />
      </div>

      {(pendingInterviews > 0 || pendingScouts > 0) && (
        <div className="hc-todo">
          {pendingInterviews > 0 && <a className="hc-todo-item" href={interviewHref}>面接の回答待ち <strong>{pendingInterviews}件</strong><Icon name="chevron" size={16} /></a>}
          {pendingScouts > 0 && <a className="hc-todo-item" href="/scouts">届いたスカウト <strong>{pendingScouts}件</strong><Icon name="chevron" size={16} /></a>}
        </div>
      )}

      <section className="hc-section">
        <SectionHeader title="おすすめ求人" action={<button type="button" className="hc-link-button" onClick={() => onNavigate('jobs')}>すべて見る</button>} />
        {featured.status === 'error' && <InlineError message={featured.error} onRetry={featured.reload} />}
        {featured.status === 'loading' && !featured.data && <SkeletonList rows={2} />}
        {featured.data && (featured.data.jobs.length
          ? <div className="hc-job-list">{featured.data.jobs.map((job) => <JobCard key={job.id} job={job} saved={savedIds.includes(job.id)} {...jobActions} />)}</div>
          : <EmptyState title="公開中の求人はまだありません" body="園から求人が公開されると、ここに表示されます。" />)}
      </section>

      <nav className="hc-menu hc-home-more" aria-label="ほかの探し方">
        <a href="/matches">希望条件に合う順で見る<Icon name="chevron" size={16} /></a>
        <a href="/spot-jobs">1日だけのスポット勤務<Icon name="chevron" size={16} /></a>
        <a href="/visits">見学・体験の予定<Icon name="chevron" size={16} /></a>
      </nav>
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

function JobsView({ savedIds, ...jobActions }: { savedIds: string[] } & JobActions) {
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
  const [deepLinkedJobId, setDeepLinkedJobId] = useState<string | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
  const focusedJobRef = useRef<string | null>(null);
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
          // An exact deep link (Google求人, notifications) is pinned first and labelled 「指定求人」.
          const pageJobs = targetJob ? [targetJob, ...page.jobs.filter((job) => job.id !== targetJob.id)] : page.jobs;
          setJobs(pageJobs);
          setDeepLinkedJobId(targetJob?.id ?? null);
          setDeepLinkNotice(targetJobId && !targetJob ? 'この求人は公開を終了したか、現在は表示できません。求人一覧から最新の募集をご確認ください。' : null);
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

  // Bring the deep-linked job into view once, after it has rendered.
  useEffect(() => {
    if (!deepLinkedJobId || focusedJobRef.current === deepLinkedJobId) return;
    const card = document.getElementById(`job-${deepLinkedJobId}`);
    if (!card) return;
    focusedJobRef.current = deepLinkedJobId;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => card.focus({ preventScroll: true }), 350);
  }, [deepLinkedJobId, jobs]);

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
  const labels = rankLabels(jobs.map((job) => job.id), deepLinkedJobId);
  const expandedJobId = jobIdFromLocation();

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
        <button type="button" className={`hc-chip ${verifiedOnly ? 'is-active' : ''}`} aria-pressed={verifiedOnly} onClick={() => setVerifiedOnly((v) => !v)}>勤務実績データあり</button>
        <button type="button" className={`hc-chip ${financeVerifiedOnly ? 'is-active' : ''}`} aria-pressed={financeVerifiedOnly} onClick={() => setFinanceVerifiedOnly((v) => !v)}>会計実績データあり</button>
      </div>
      {facets.status === 'error' && <InlineError message={facets.error} onRetry={facets.reload} compact />}

      <div className="hc-result-bar">
        <strong aria-live="polite">{status === 'success' ? `${totalCount}件` : status === 'loading' ? '検索中…' : ''}</strong>
        {hasFilters
          ? <button type="button" className="hc-link-button" onClick={clearFilters}>条件をクリア</button>
          : <a className="hc-link-button" href="/matches">マッチ度順で見る</a>}
      </div>
      <RankingDisclosure />
      {deepLinkNotice && <p className="hc-notice" role="status">{deepLinkNotice}</p>}

      {status === 'error' && <InlineError message={searchError || '求人を検索できませんでした。'} onRetry={() => setAttempt((v) => v + 1)} />}
      {status === 'loading' && !jobs.length && <SkeletonList rows={3} />}
      {status === 'success' && !jobs.length && <EmptyState title="条件に合う求人はありません" body="条件を変えて、もう一度探してみてください。" action={hasFilters ? '条件をクリア' : undefined} onAction={hasFilters ? clearFilters : undefined} />}
      {jobs.length > 0 && status !== 'error' && (
        <div className="hc-job-list" aria-busy={status === 'loading'}>
          {jobs.map((job, index) => <JobCard key={job.id} job={job} saved={savedIds.includes(job.id)} initiallyExpanded={expandedJobId === job.id} rankLabel={labels[index]} {...jobActions} />)}
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

function SavedView({ onNavigate, ...jobActions }: { onNavigate: (v: View) => void } & JobActions) {
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
            <div className="hc-job-list">{saved.data.map((job) => <JobCard key={job.id} job={job} saved {...jobActions} />)}</div>
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
      <a className="hc-link-button hc-block-link" href="/visits">見学・体験の予定を見る</a>
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="hc-field"><span>{label}{required && <em className="hc-required">必須</em>}</span>{children}</label>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)); }
function statusLabel(status: string) { return ({ new: '応募済み', applied: '応募済み', reviewing: '書類確認中', screening: '書類確認中', review: '確認中', interview: '面接予定', offered: '内定', offer: '内定', hired: '採用', rejected: '選考終了', withdrawn: '辞退' } as Record<string, string>)[status] || status; }
