import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { EmptyState, InlineError, SkeletonList } from '../components/StateViews';
import { errorMessage } from '../lib/useResource';
import { listMyVisits, type JobseekerVisit, type VisitExperienceType, type VisitReservationStatus } from '../lib/visitRepository';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATUSES = new Set<VisitReservationStatus>(['requested', 'confirmed']);

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

/** Upcoming and past visits / trial days. Booking itself happens from a job's details. */
export function VisitsView() {
  const [visits, setVisits] = useState<JobseekerVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
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
      setLoaded(true);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || quiet) return;
      setMissingTarget(false);
      setError(errorMessage(err, '見学・体験の履歴を読み込めませんでした。'));
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

  return (
    <div className="hc-view hc-visits">
      {error && <InlineError message={error} onRetry={() => void load()} />}
      {loading && !loaded && <SkeletonList rows={2} />}
      {missingTarget && <p className="hc-notice">指定された見学・体験は見つかりませんでした。現在の予約・履歴のみ表示しています。</p>}
      {loaded && visits.length === 0 && (
        <EmptyState title="見学・体験の予定はまだありません" body="気になる園の求人詳細から、園見学・半日体験・1日体験を申し込めます。" action="求人を探す" href="/jobs" />
      )}
      {active.length > 0 && <VisitSection title="これからの見学・体験" items={active} />}
      {history.length > 0 && <VisitSection title="これまでの履歴" items={history} />}
    </div>
  );
}

function VisitSection({ title, items }: { title: string; items: JobseekerVisit[] }) {
  return (
    <section className="hc-section">
      <div className="hc-section-head"><h2>{title}</h2><span className="hc-count">{items.length}件</span></div>
      <div className="hc-card-list">{items.map((item) => <VisitCard key={item.reservation_id} item={item} />)}</div>
    </section>
  );
}

function VisitCard({ item }: { item: JobseekerVisit }) {
  const applicationHref = item.application_id && UUID_PATTERN.test(item.application_id)
    ? `/applications?application_id=${encodeURIComponent(item.application_id)}`
    : null;
  const jobHref = UUID_PATTERN.test(item.job_id) ? `/jobs?job_id=${encodeURIComponent(item.job_id)}` : '/jobs';

  return (
    <article id={`visit-${item.reservation_id}`} className={`hc-card visit-card status-${item.status}`} tabIndex={-1}>
      <div className="hc-card-badges">
        <span className="hc-tag is-accent">{experienceLabels[item.experience_type]}</span>
        <span className={`status-badge visit-status-${item.status}`}>{statusLabels[item.status]}</span>
      </div>
      <span className="hc-card-overline">{item.facility_name}</span>
      <h3>{item.job_title}</h3>
      <p className="hc-job-meta"><Icon name="clock" size={16} /> {formatDateTime(item.starts_at)}</p>
      <p className="hc-job-meta"><Icon name="map" size={16} /> {formatAddress(item)}</p>
      {item.candidate_message && <div className="hc-quote"><strong>申込時のメッセージ</strong><p>{item.candidate_message}</p></div>}
      <div className="hc-card-actions">
        {applicationHref && <a className="secondary-button" href={applicationHref}>応募状況を見る</a>}
        <a className="secondary-button" href={jobHref}>求人を見る</a>
      </div>
    </article>
  );
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
