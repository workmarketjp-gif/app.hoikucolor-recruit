import { ClerkProvider, useAuth, useClerk, useSession, useUser } from '@clerk/react';
import { useEffect, useMemo, useState } from 'react';
import { Brand } from './components/Brand';
import { Icon } from './components/Icon';
import { NotificationCenter } from './components/NotificationCenter';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { getProfile, submitApplication } from './lib/recruitRepository';
import { listMySpotAssignments, listSpotJobs, type SpotAssignment, type SpotJobListing } from './lib/spotJobRepository';
import { setSupabaseAccessTokenGetter } from './lib/supabase';
import './SpotJobsRouteRoot.css';

const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const poppyUrl = (import.meta.env.VITE_HOIKU_POPPY_URL || 'https://app.hoikupoppy.ai').replace(/\/$/, '');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const navItems = [
  { href: '/', label: 'ホーム', icon: 'home' as const },
  { href: '/jobs', label: '求人を探す', icon: 'search' as const },
  { href: '/spot-jobs', label: 'スポット求人', icon: 'clock' as const },
  { href: '/saved', label: '気になる', icon: 'heart' as const },
  { href: '/applications', label: '応募管理', icon: 'briefcase' as const },
  { href: '/scouts', label: 'スカウト', icon: 'sparkles' as const },
  { href: '/profile', label: 'プロフィール', icon: 'user' as const },
];

export function SpotJobsRouteRoot() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHoikuColorClerkPublishableKey()
      .then((value) => active && setKey(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'ログイン設定を取得できませんでした。'));
    return () => { active = false; };
  }, []);

  if (error) return <SpotRouteState title="ログイン設定を読み込めませんでした" body={error} action="再読み込み" onAction={() => window.location.reload()} />;
  if (!key) return <SpotRouteState title="Hoiku Color" body="ログイン設定を読み込んでいます" loading />;

  return (
    <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/spot-jobs" signUpFallbackRedirectUrl="/spot-jobs">
      <SpotRouteGate />
    </ClerkProvider>
  );
}

function SpotRouteGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [jobs, setJobs] = useState<SpotJobListing[]>([]);
  const [assignments, setAssignments] = useState<SpotAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

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

  const refresh = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [nextJobs, nextAssignments] = await Promise.all([listSpotJobs(), listMySpotAssignments()]);
      setJobs(nextJobs);
      setAssignments(nextAssignments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'スポット求人を読み込めませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [session]);

  useEffect(() => {
    if (loading || assignments.length === 0) return;
    const assignmentId = new URLSearchParams(window.location.search).get('assignment_id');
    if (!assignmentId || !UUID_PATTERN.test(assignmentId) || !assignments.some((item) => item.assignment_id === assignmentId)) return;
    const target = document.getElementById(`spot-assignment-${assignmentId}`);
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    });
  }, [assignments, loading]);

  const apply = async (job: SpotJobListing) => {
    setApplyingId(job.job_id);
    setError(null);
    try {
      const profile = await getProfile();
      if (!profile?.name?.trim()) throw new Error('応募前にプロフィールのお名前を保存してください。');
      const applicationId = await submitApplication(job.job_id, profile);
      setJobs((current) => current.map((item) => item.job_id === job.job_id
        ? { ...item, application_id: applicationId, application_status: item.application_status || 'new' }
        : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'スポット求人へ応募できませんでした。');
    } finally {
      setApplyingId(null);
    }
  };

  if (!isLoaded || !isSignedIn) return <SpotRouteState title="Hoiku Color" body="ログイン状態を確認しています" loading />;
  if (user?.unsafeMetadata?.hoikuColorAccountType === 'nursery') {
    return <SpotRouteState title="園・法人アカウントです" body="園・法人の管理画面はHoiku Poppyをご利用ください。" action="Hoiku Poppyを開く" onAction={() => window.location.assign(poppyUrl)} />;
  }

  const displayName = user?.fullName || user?.firstName || 'ゲスト';
  const logout = async () => {
    if (!window.confirm('Hoiku Colorからログアウトしますか？')) return;
    await signOut({ redirectUrl: '/login' });
  };

  return (
    <div className="app-shell spot-route-shell">
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる"><Icon name="close" /></button>
        <a className="sidebar-brand" href="/"><Brand /></a>
        <span className="nav-label">MY PAGE</span>
        <nav className="side-nav" aria-label="マイページ">
          {navItems.map((item) => (
            <a key={item.href} className={`nav-item ${item.href === '/spot-jobs' ? 'active' : ''}`} href={item.href}>
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
          <div className="mobile-brand"><Brand compact /></div><div className="topbar-spacer" />
          <a className="public-link" href={`${publicUrl}/jobs`} target="_blank" rel="noreferrer">求人サイト <Icon name="external" size={14} /></a>
          <NotificationCenter onNavigate={(target) => window.location.assign(target)} />
        </header>

        <section className="content spot-route-content">
          <header className="page-heading spot-route-heading">
            <div><span className="eyebrow">ONE-DAY WORK</span><h1>スポット求人</h1><p>勤務日・時間・時給・休憩を確認して、1日単位の勤務に応募できます。通常求人とは分けて表示しています。</p></div>
            <a className="secondary-button" href="/jobs"><Icon name="search" size={15} /> 通常求人を見る</a>
          </header>

          {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => setError(null)}>閉じる</button></div>}
          {loading ? <SpotRouteState title="スポット勤務を確認しています" body="募集中の勤務枠と確定した勤務を読み込んでいます。" loading embedded /> : (
            <>
              {assignments.length > 0 && (
                <section className="spot-assignment-section" aria-labelledby="spot-assignment-heading">
                  <div className="spot-section-heading">
                    <div><span className="eyebrow">MY SPOT WORK</span><h2 id="spot-assignment-heading">あなたのスポット勤務</h2></div>
                    <p>園が勤務を確定した後も、募集枠が満員・募集終了になってもここから勤務日時を確認できます。</p>
                  </div>
                  <div className="spot-assignment-grid">{assignments.map((assignment) => <SpotAssignmentCard key={assignment.assignment_id} assignment={assignment} />)}</div>
                </section>
              )}

              <section className="spot-guide" aria-label="スポット求人の流れ">
                <strong>Hoiku Office連携</strong><span>園が勤務を確定すると、Hoiku Officeのシフトへ連携されます。確定後は上の「あなたのスポット勤務」からいつでも確認できます。</span>
              </section>

              {jobs.length ? <div className="spot-job-grid">{jobs.map((job) => (
                <SpotJobCard key={job.job_id} job={job} applying={applyingId === job.job_id} onApply={() => void apply(job)} />
              ))}</div> : <div className="empty-state"><span className="empty-icon"><Icon name="clock" /></span><h3>現在募集中のスポット求人はありません</h3><p>{assignments.length ? '確定済みの勤務は上の「あなたのスポット勤務」から確認できます。' : '新しい勤務枠が公開されると、ここに表示されます。'}</p><a className="secondary-button" href="/jobs">通常求人を見る</a></div>}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function SpotAssignmentCard({ assignment }: { assignment: SpotAssignment }) {
  const workedMinutes = useMemo(() => Math.max(0, timeToMinutes(assignment.end_time) - timeToMinutes(assignment.start_time) - assignment.break_minutes), [assignment]);
  const active = assignment.assignment_status === 'confirmed';
  return <article id={`spot-assignment-${assignment.assignment_id}`} className={`spot-assignment-card ${active ? 'is-confirmed' : ''}`} tabIndex={-1}>
    <div className="spot-job-card-head">
      <div><span className={`spot-status-badge status-${assignment.assignment_status}`}>{spotAssignmentStatusLabel(assignment.assignment_status)}</span><span className="spot-location"><Icon name="map" size={14} /> {assignment.prefecture || '地域未設定'} {assignment.city || ''}</span></div>
      {active && <span className="spot-office-linked">Hoiku Office シフト連携済み</span>}
    </div>
    <span className="facility-name">{assignment.facility_name}</span><h3>{assignment.title}</h3>
    <div className="spot-primary-details">
      <div><small>勤務日</small><strong>{formatWorkDate(assignment.work_date)}</strong></div>
      <div><small>勤務時間</small><strong>{formatTime(assignment.start_time)}〜{formatTime(assignment.end_time)}</strong></div>
      <div><small>時給</small><strong>¥{Number(assignment.hourly_rate).toLocaleString('ja-JP')}</strong></div>
      <div><small>休憩</small><strong>{assignment.break_minutes}分</strong></div>
    </div>
    <div className="spot-secondary-details"><span><strong>実働</strong> {formatWorkedMinutes(workedMinutes)}</span>{assignment.address && <span><strong>勤務先</strong> {assignment.address}</span>}</div>
    <div className="spot-card-actions"><a className="secondary-button" href={`/applications?application_id=${encodeURIComponent(assignment.application_id)}`}>応募内容を見る <Icon name="arrow" size={14} /></a></div>
  </article>;
}

function SpotJobCard({ job, applying, onApply }: { job: SpotJobListing; applying: boolean; onApply: () => void }) {
  const workedMinutes = useMemo(() => Math.max(0, timeToMinutes(job.end_time) - timeToMinutes(job.start_time) - job.break_minutes), [job]);
  const applied = Boolean(job.application_id);
  return <article className="spot-job-card">
    <div className="spot-job-card-head">
      <div><span className="spot-badge">スポット勤務</span><span className="spot-location"><Icon name="map" size={14} /> {job.prefecture || '地域未設定'} {job.city || ''}</span></div>
      <span className="spot-capacity">確定済みを除く残り {job.available_count}枠</span>
    </div>
    <span className="facility-name">{job.facility_name}</span><h2>{job.title}</h2>
    <div className="spot-primary-details">
      <div><small>勤務日</small><strong>{formatWorkDate(job.work_date)}</strong></div>
      <div><small>勤務時間</small><strong>{formatTime(job.start_time)}〜{formatTime(job.end_time)}</strong></div>
      <div><small>時給</small><strong>¥{Number(job.hourly_rate).toLocaleString('ja-JP')}</strong></div>
      <div><small>休憩</small><strong>{job.break_minutes}分</strong></div>
    </div>
    <div className="spot-secondary-details">
      <span><strong>実働</strong> {formatWorkedMinutes(workedMinutes)}</span>
      <span><strong>募集枠</strong> {job.required_count}名</span>
      {job.age_group_or_class && <span><strong>担当</strong> {job.age_group_or_class}</span>}
      {job.required_qualification && <span><strong>資格</strong> {job.required_qualification}</span>}
      {job.closing_at && <span><strong>募集終了予定</strong> {formatClosing(job.closing_at)}</span>}
    </div>
    {job.description && <p>{job.description}</p>}
    {job.facility_message && <div className="spot-message"><strong>園からのメッセージ</strong><span>{job.facility_message}</span></div>}
    <div className="spot-card-actions">
      {applied ? <><span className="spot-applied">応募済み{job.application_status ? `・${applicationStatusLabel(job.application_status)}` : ''}</span><a className="primary-button" href={`/applications?application_id=${encodeURIComponent(job.application_id!)}`}>応募状況を見る <Icon name="arrow" size={14} /></a></>
        : <button className="primary-button" type="button" disabled={applying || job.available_count <= 0} onClick={onApply}>{applying ? '応募中…' : 'このスポットに応募'} <Icon name="arrow" size={14} /></button>}
    </div>
  </article>;
}

function SpotRouteState({ title, body, loading, action, onAction, embedded }: { title: string; body: string; loading?: boolean; action?: string; onAction?: () => void; embedded?: boolean }) {
  return <div className={embedded ? 'spot-route-state embedded' : 'spot-route-state'}>{loading && <span className="loading-ring" />}{!embedded && <Brand />}<h1>{title}</h1><p>{body}</p>{action && onAction && <button className="primary-button" type="button" onClick={onAction}>{action}</button>}</div>;
}

function timeToMinutes(value: string) { const [h, m] = value.slice(0, 5).split(':').map(Number); return h * 60 + m; }
function formatTime(value: string) { return value.slice(0, 5); }
function formatWorkedMinutes(value: number) { const h = Math.floor(value / 60); const m = value % 60; return m ? `${h}時間${m}分` : `${h}時間`; }
function formatWorkDate(value: string) { return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(`${value}T12:00:00+09:00`)); }
function formatClosing(value: string) { return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(value)); }
function applicationStatusLabel(status: string) { return ({ new: '応募済み', applied: '応募済み', reviewing: '確認中', screening: '確認中', interview: '面接調整中', hired: '確定', rejected: '不採用', withdrawn: '辞退' } as Record<string, string>)[status] || status; }
function spotAssignmentStatusLabel(status: string) { return ({ confirmed: '勤務確定', completed: '勤務完了', cancelled: 'キャンセル', no_show: '未勤務' } as Record<string, string>)[status] || status; }
