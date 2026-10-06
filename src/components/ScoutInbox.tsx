import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { EmptyState, InlineError, SkeletonList } from './StateViews';
import { errorMessage } from '../lib/useResource';
import { listJobseekerScouts, respondToJobseekerScout, type JobseekerScout } from '../lib/scoutInboxRepository';
import './ScoutInbox.css';

const statusLabels: Record<JobseekerScout['scout_status'], string> = {
  pending: '回答待ち',
  accepted: '承諾済み',
  declined: '辞退済み',
  cancelled: '取り消し',
  expired: '期限切れ',
};

const scoutIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function requestedScoutId() {
  try {
    const value = new URLSearchParams(window.location.search).get('scout_id');
    return value && scoutIdPattern.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function ScoutInbox() {
  const [items, setItems] = useState<JobseekerScout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targetScoutId] = useState<string | null>(() => requestedScoutId());
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  const pendingCount = useMemo(() => items.filter((item) => item.scout_status === 'pending').length, [items]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await listJobseekerScouts();
      if (!mountedRef.current) return;
      setItems(next);
      setLoaded(true);
      setError(null);
    } catch (err) {
      // A failed background refresh keeps the last good list instead of flashing an error.
      if (!mountedRef.current || quiet) return;
      setError(errorMessage(err, 'スカウトを読み込めませんでした。'));
    } finally {
      if (mountedRef.current && !quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  useEffect(() => {
    if (loading || focusedRef.current || window.location.hash !== '#scout-inbox') return;
    const targetId = targetScoutId && items.some((item) => item.scout_id === targetScoutId) ? `scout-${targetScoutId}` : 'scout-inbox';
    const element = document.getElementById(targetId);
    if (!element) return;
    focusedRef.current = true;
    window.setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (element instanceof HTMLElement) element.focus({ preventScroll: true });
    }, 80);
  }, [items, loading, targetScoutId]);

  const respond = async (item: JobseekerScout, decision: 'accepted' | 'declined') => {
    if (busyId) return;
    const message = decision === 'accepted'
      ? `${item.facility_name}からのスカウトを承諾しますか？\n\n承諾後は、園が今後の連絡に必要な氏名・メール・電話番号等を確認できるようになります。`
      : `${item.facility_name}からのスカウトを辞退しますか？\n\n辞退した場合、氏名・連絡先は園へ共有されません。`;
    if (!window.confirm(message)) return;
    setBusyId(item.scout_id); setError(null); setNotice(null);
    try {
      const status = await respondToJobseekerScout(item.scout_id, decision);
      setItems((prev) => prev.map((row) => row.scout_id === item.scout_id ? { ...row, scout_status: status, responded_at: new Date().toISOString() } : row));
      setNotice(status === 'accepted' ? `${item.facility_name}からのスカウトを承諾しました。` : `${item.facility_name}からのスカウトを辞退しました。`);
    } catch (err) {
      setError(errorMessage(err, 'スカウトへ回答できませんでした。'));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return <section className="hc-section scout-inbox" id="scout-inbox" tabIndex={-1} aria-labelledby="scout-inbox-heading">
    <div className="hc-section-head">
      <h2 id="scout-inbox-heading">届いた匿名スカウト</h2>
      {loaded && <span className="hc-count">回答待ち {pendingCount}件</span>}
    </div>
    <p className="hc-note">園には匿名プロフィールだけが共有されています。承諾するまで氏名・メール・電話番号は開示されません。</p>

    <div className="scout-consent-note"><Icon name="shield" size={17} /><div><strong>本人情報の共有はあなたが決めます</strong><p>承諾したスカウトだけ、今後の連絡に必要な本人情報を園が確認できる状態になります。辞退・期限切れでは本人情報を共有しません。</p></div></div>

    {error && <InlineError message={error} onRetry={() => void load()} />}
    {notice && <p className="form-success" role="status">{notice}</p>}
    {loading && !loaded ? <SkeletonList rows={2} /> : !loaded ? null : items.length === 0 ? <EmptyState title="スカウトはまだ届いていません" body="下の「スカウト設定」で匿名スカウトを受け取るをONにすると、希望条件や保育観を見た園からお誘いが届くことがあります。" /> : <div className="scout-inbox-list">
      {items.map((item) => <article id={`scout-${item.scout_id}`} tabIndex={-1} className={`scout-inbox-card status-${item.scout_status} ${targetScoutId === item.scout_id ? 'is-targeted' : ''}`} key={item.scout_id}>
        <div className="scout-inbox-card-head"><div><span className={`scout-status status-${item.scout_status}`}>{statusLabels[item.scout_status]}</span><h4>{item.facility_name}</h4><p>{item.organization_name}</p></div><small>{formatDateTime(item.sent_at)}</small></div>
        {(item.job_title || item.employment_type) && <div className="scout-job-line"><Icon name="briefcase" size={15} /><span>{item.job_title || '募集職種'}{item.employment_type ? ` ・ ${item.employment_type}` : ''}</span></div>}
        {item.invitation_message && <p className="scout-message">{item.invitation_message}</p>}
        <div className="scout-inbox-meta"><span>回答期限 {formatDateTime(item.expires_at)}</span>{item.responded_at && <span>回答 {formatDateTime(item.responded_at)}</span>}</div>
        {item.scout_status === 'pending' && <div className="scout-inbox-actions"><button type="button" className="secondary-button" disabled={Boolean(busyId)} onClick={() => void respond(item, 'declined')}>{busyId === item.scout_id ? '処理中…' : '辞退する'}</button><button type="button" className="primary-button" disabled={Boolean(busyId)} onClick={() => void respond(item, 'accepted')}>{busyId === item.scout_id ? '処理中…' : '承諾する'}</button></div>}
        {item.scout_status === 'accepted' && <p className="scout-response-note is-accepted">承諾済みです。園からの連絡をお待ちください。</p>}
        {item.scout_status === 'declined' && <p className="scout-response-note">辞退済みです。本人情報は共有されません。</p>}
        {item.scout_status === 'expired' && <p className="scout-response-note">回答期限を過ぎています。本人情報は共有されません。</p>}
      </article>)}
    </div>}
  </section>;
}
