import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  listJobseekerNotifications,
  markAllJobseekerNotificationsRead,
  markJobseekerNotificationRead,
  type JobseekerNotification,
} from '../lib/notificationRepository';
import { listJobseekerScouts } from '../lib/scoutInboxRepository';
import './NotificationCenter.css';

type Props = {
  onNavigate: (target: string) => void;
};

const ALLOWED_PATHS = new Set(['/', '/jobs', '/saved', '/applications', '/profile', '/scouts']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERVIEW_NOTIFICATION_TYPES = new Set(['interview_scheduled', 'interview_cancelled']);

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'たった今';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(new Date(timestamp));
}

function safeTarget(item: JobseekerNotification) {
  try {
    const parsed = new URL(item.link_url || '/applications', window.location.origin);
    if (parsed.origin !== window.location.origin || !ALLOWED_PATHS.has(parsed.pathname)) return '/applications';

    if (parsed.pathname === '/applications' && item.application_id && UUID_PATTERN.test(item.application_id)) {
      let target = `/applications?application_id=${encodeURIComponent(item.application_id)}`;
      let hash = '';

      if (INTERVIEW_NOTIFICATION_TYPES.has(item.notification_type)) {
        const interviewId = parsed.searchParams.get('interview_id');
        if (interviewId && UUID_PATTERN.test(interviewId)) {
          target += `&interview_id=${encodeURIComponent(interviewId)}`;
          hash = `#interview-${interviewId}`;
        }
      } else if (item.notification_type === 'message_received') {
        hash = '#application-messages';
      }

      return `${target}${hash}`;
    }

    if (item.notification_type === 'scout_received' && (parsed.pathname === '/profile' || parsed.pathname === '/scouts')) {
      const scoutId = parsed.searchParams.get('scout_id');
      const query = scoutId && UUID_PATTERN.test(scoutId) ? `?scout_id=${encodeURIComponent(scoutId)}` : '';
      return `/scouts${query}#scout-inbox`;
    }

    return parsed.pathname;
  } catch {
    return '/applications';
  }
}

export function NotificationCenter({ onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<JobseekerNotification[]>([]);
  const [pendingScoutCount, setPendingScoutCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  const unreadCount = useMemo(() => items.filter((item) => !item.read_at).length, [items]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await listJobseekerNotifications();
      if (!mountedRef.current) return;
      setItems(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : '通知を読み込めませんでした。');
    } finally {
      if (mountedRef.current && !quiet) setLoading(false);
    }
  }, []);

  const loadScoutCount = useCallback(async () => {
    try {
      const scouts = await listJobseekerScouts();
      if (!mountedRef.current) return;
      setPendingScoutCount(scouts.filter((item) => item.scout_status === 'pending').length);
    } catch {
      if (mountedRef.current) setPendingScoutCount(0);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    void loadScoutCount();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load(true);
        void loadScoutCount();
      }
    }, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load(true);
        void loadScoutCount();
      }
    };
    const onExternalRefresh = () => {
      void load(true);
      void loadScoutCount();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('hc:notifications-refresh', onExternalRefresh);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('hc:notifications-refresh', onExternalRefresh);
    };
  }, [load, loadScoutCount]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const openNotification = async (item: JobseekerNotification) => {
    if (!item.read_at) {
      try {
        const updated = await markJobseekerNotificationRead(item.id);
        if (updated) {
          const readAt = new Date().toISOString();
          setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: readAt } : row));
          window.dispatchEvent(new CustomEvent('hc:attention-refresh'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '通知を既読にできませんでした。');
        return;
      }
    }
    setOpen(false);
    const target = safeTarget(item);
    if (target.startsWith('/scouts') || target.startsWith('/applications?')) {
      window.location.assign(target);
      return;
    }
    onNavigate(target);
  };

  const markAllRead = async () => {
    try {
      const updatedCount = await markAllJobseekerNotificationsRead();
      if (updatedCount > 0) {
        const readAt = new Date().toISOString();
        setItems((current) => current.map((row) => row.read_at ? row : { ...row, read_at: readAt }));
        window.dispatchEvent(new CustomEvent('hc:attention-refresh'));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '通知を既読にできませんでした。');
    }
  };

  return (
    <div className="notification-center" ref={rootRef}>
      <a className={`icon-button scout-shortcut ${window.location.pathname.startsWith('/scouts') ? 'is-active' : ''}`} href="/scouts" aria-label={pendingScoutCount ? `スカウト 回答待ち${pendingScoutCount}件` : 'スカウト'} title="スカウト">
        <Icon name="sparkles" size={18} />
        {pendingScoutCount > 0 && <span className="notification-badge" aria-hidden="true">{pendingScoutCount > 99 ? '99+' : pendingScoutCount}</span>}
      </a>
      <button
        type="button"
        className={`icon-button notification-trigger ${open ? 'is-open' : ''}`}
        aria-label={unreadCount ? `通知 未読${unreadCount}件` : '通知'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load(true);
        }}
      >
        <Icon name="bell" size={18} />
        {unreadCount > 0 && <span className="notification-badge" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-popover" role="dialog" aria-label="通知一覧">
          <header className="notification-head">
            <div>
              <strong>通知</strong>
              <small>{unreadCount ? `未読 ${unreadCount}件` : 'すべて確認済み'}</small>
            </div>
            {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()}>すべて既読</button>}
          </header>
          <div className="notification-list">
            {loading && items.length === 0 && <p className="notification-state">読み込み中…</p>}
            {error && <p className="notification-state is-error">{error}</p>}
            {!loading && !error && items.length === 0 && <p className="notification-state">新しい通知はありません。</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notification-item ${item.read_at ? '' : 'is-unread'}`}
                onClick={() => void openNotification(item)}
              >
                <span className="notification-dot" aria-hidden="true" />
                <span className="notification-copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <small>{relativeTime(item.created_at)}</small>
                </span>
                <Icon name="chevron" size={14} />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
