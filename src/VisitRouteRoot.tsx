import { ClerkProvider, useAuth, useClerk, useSession, useUser } from '@clerk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brand } from './components/Brand';
import { Icon } from './components/Icon';
import { NotificationCenter } from './components/NotificationCenter';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { setSupabaseAccessTokenGetter } from './lib/supabase';
import { listMyVisits, type JobseekerVisit, type VisitExperienceType, type VisitReservationStatus } from './lib/visitRepository';
import './VisitRouteRoot.css';

const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const poppyUrl = (import.meta.env.VITE_HOIKU_POPPY_URL || 'https://app.hoikupoppy.ai').replace(/\/$/, '');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = new Set<VisitReservationStatus>(['requested', 'confirmed']);

const navItems = [
  { href: '/', label: 'ホーム', icon: 'home' as const },
  { href: '/jobs', label: '求人を探す', icon: 'search' as const },
  { href: '/saved', label: '気になる', icon: 'heart' as const },
  { href: '/applications', label: '応募管理', icon: 'briefcase' as const },
  { href: '/visits', label: '見学・体験', icon: 'clock' as const },
  { href: '/spot-jobs', label: 'スポット求人', icon: 'clock' as const },
  { href: '/scouts', label: 'スカウト', icon: 'sparkles' as const },
  { href: '/profile', label: 'プロフィール', icon: 'user' as const },
];

const experienceLabels: Record<VisitExperienceType, string> = {
  visit: '園見学',
  half_day_trial: '半日体験',
  full_day_trial: '1日体験',
};

const statusLabels: Record<VisitReservationStatus, string> = {
  requested: '日程調整中',
  confirmed: '確定',
  declined: '日程調整不可',
  cancelled: 'キャンセル',
  completed: '完了',
  no_show: '未参加',
};

function requestedVisitId() {
  const value = new URLSearchParams(window.location.search).get('visit_id');
  return value && UUID_PATTERN.test(value) ? value : null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '日時未設定';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAddress(item: JobseekerVisit) {
  return [item.prefecture, item.city, item.address].filter(Boolean).join('') || '住所未公開';
}

export function VisitRouteRoot() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHoikuColorClerkPublishableKey()
      .then((value) => active && setKey(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'ログイン設定を取得できませんでした。'));
    return () => { active = false; };
  }, []);

  if (error) return <VisitRouteState title="ログイン設定を読み込めませんでした" body={error} action="再読み込み" onAction={() => window.location.reload()} />;
  if (!key) return <VisitRouteState title="Hoiku Color" body="ログイン設定を読み込んでいます" loading />;

  return (
    <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/visits" signUpFallbackRedirectUrl="/visits">
      <VisitRouteGate />
    </ClerkProvider>
  );
}

function VisitRouteGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [supabaseReady, setSupabaseReady] = useState(false);

  useEffect(() => {
    setSupabaseReady(false);
    if (!session) {
      setSupabaseAccessTokenGetter(null);
      return;
    }
    setSupabaseAccessTokenGetter(() => session.getToken());
    setSupabaseReady(true);
    return () => setSupabaseAccessTokenGetter(null);
  }, [session]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) window.location.replace('/login');
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || !isSignedIn || !session || !supabaseReady) return <VisitRouteState title="Hoiku Color" body="ログイン状態を確認しています" loading />;

  if (user?.unsafeMetadata?.hoikuColorAccountType === 'nursery') {
    return <VisitRouteState title="園・法人アカウントです" body="園・法人の管理画面はHoiku Poppyをご利用ください。" action="Hoiku Poppyを開く" onAction={() => window.location.assign(poppyUrl)} />;
  }

  const displayName = user?.fullName || user?.firstName || 'ゲスト';
  const logout = async () => {
    if (!window.confirm('Hoiku Colorからログアウトしますか？')) return;
    await signOut({ redirectUrl: '/login' });
  };

  return (
    <div className="app-shell visit-route-shell">
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="メニューを閉じる"><Icon name="close" /></button>
        <a className="sidebar-brand" href="/"><Brand /></a>
        <span className="nav-label">MY PAGE</span>
        <nav className="side-nav" aria-label="マイページ">
          {navItems.map((item) => (
            <a key={item.href} className={`nav-item ${item.href === '/visits' ? 'active' : ''}`} href={item.href}>
              <Icon name={item.icon} size={18} /><span>{item.label}</span>
            </a>
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

        <section className="content visit-route-content">
          <header className="page-heading visit-route-heading">
            <div><span className="eyebrow">VISITS & TRIALS</span><h1>見学・体験</h1><p>園見学・半日体験・1日体験の予定と履歴をまとめて確認できます。</p></div>
            <a className="secondary-button" href="/jobs"><Icon name="search" size={15} /> 求人を探す</a>
          </header>
          <VisitHistory />
        </section>
      </main>
    </div>
  );
}

function VisitHistory() {
  const [visits, setVisits] = useState<JobseekerVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);
  const mountedRef = useRef(true);
  const handledVisitRef = useRef<string | null>(null);
  const visitId = useMemo(() => requestedVisitId(), []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await listMyVisits();
      if (!mountedRef.current) return;
      setVisits(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setMissingTarget(false);
      setError(err instanceof Error ? err.message : '見学・体験の履歴を読み込めませんでした。');
    } finally {
      if (mountedRef.current && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void load(true);
    };
    const intervalId = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('hc:visits-refresh', refreshWhenVisible);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('hc:visits-refresh', refreshWhenVisible);
    };
  }, [load]);

  useEffect(() => {
    if (loading || error || !visitId || handledVisitRef.current === visitId) return;
    const ownedVisit = visits.find((item) => item.reservation_id === visitId);
    if (!ownedVisit) {
      setMissingTarget(true);
      return;
    }
    handledVisitRef.current = visitId;
    setMissingTarget(false);
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`visit-${visitId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    });
  }, [error, loading, visitId, visits]);

  const active = useMemo(() => visits
    .filter((item) => ACTIVE_STATUSES.has(item.status))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()), [visits]);
  const history = useMemo(() => visits
    .filter((item) => !ACTIVE_STATUSES.has(item.status))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()), [visits]);

  if (loading && visits.length === 0) return <div className="visit-route-state inline"><span className="loading-ring" /><p>見学・体験を読み込んでいます。</p></div>;

  return (
    <div className="visit-history">
      {error && <div className="error-banner"><span>{error}</span><button type="button" onClick={() => void load()}>再読み込み</button></div>}
      {missingTarget && <div className="visit-target-warning">指定された見学・体験は見つかりませんでした。現在の予約・履歴のみ表示しています。</div>}
      {!error && visits.length === 0 && (
        <section className="visit-empty panel">
          <span className="visit-empty-icon"><Icon name="clock" size={24} /></span>
          <h2>見学・体験の予定はまだありません</h2>
          <p>気になる園の求人詳細から、園見学・半日体験・1日体験を申し込めます。</p>
          <a className="primary-button" href="/jobs"><Icon name="search" size={15} /> 求人を探す</a>
        </section>
      )}
      {active.length > 0 && <VisitSection title="これからの見学・体験" eyebrow="UPCOMING" items={active} />}
      {history.length > 0 && <VisitSection title="これまでの履歴" eyebrow="HISTORY" items={history} />}
    </div>
  );
}

function VisitSection({ title, eyebrow, items }: { title: string; eyebrow: string; items: JobseekerVisit[] }) {
  return (
    <section className="visit-section">
      <header><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><small>{items.length}件</small></header>
      <div className="visit-list">{items.map((item) => <VisitCard key={item.reservation_id} item={item} />)}</div>
    </section>
  );
}

function VisitCard({ item }: { item: JobseekerVisit }) {
  const applicationHref = item.application_id && UUID_PATTERN.test(item.application_id)
    ? `/applications?application_id=${encodeURIComponent(item.application_id)}`
    : null;
  const jobHref = UUID_PATTERN.test(item.job_id) ? `/jobs?job_id=${encodeURIComponent(item.job_id)}` : '/jobs';

  return (
    <article id={`visit-${item.reservation_id}`} className={`visit-card status-${item.status}`} tabIndex={-1}>
      <div className="visit-card-top">
        <div><span className="visit-type">{experienceLabels[item.experience_type]}</span><h3>{item.facility_name}</h3><p>{item.job_title}</p></div>
        <span className={`visit-status status-${item.status}`}>{statusLabels[item.status]}</span>
      </div>
      <div className="visit-facts">
        <span><Icon name="clock" size={16} /><strong>{formatDateTime(item.starts_at)}</strong></span>
        <span><Icon name="map" size={16} />{formatAddress(item)}</span>
      </div>
      {item.candidate_message && <div className="visit-message"><small>申込時のメッセージ</small><p>{item.candidate_message}</p></div>}
      <div className="visit-actions">
        {applicationHref && <a className="secondary-button" href={applicationHref}><Icon name="briefcase" size={15} /> 応募状況を見る</a>}
        <a className="secondary-button" href={jobHref}><Icon name="search" size={15} /> 求人を見る</a>
      </div>
    </article>
  );
}

function VisitRouteState({ title, body, loading, action, onAction }: { title: string; body: string; loading?: boolean; action?: string; onAction?: () => void }) {
  return <div className="visit-route-state">{loading && <span className="loading-ring" />}<Brand /><h1>{title}</h1><p>{body}</p>{action && onAction && <button className="primary-button" type="button" onClick={onAction}>{action}</button>}</div>;
}