import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import {
  getJobseekerAttentionSummary,
  markJobseekerApplicationMessagesRead,
  type JobseekerAttentionSummary,
} from '../lib/attentionRepository';
import './AttentionSummaryEnhancer.css';

type Targets = {
  dashboardHost: HTMLElement | null;
  topbarHost: HTMLElement | null;
};

type ApplicationMessagesViewedDetail = {
  applicationId?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyTargets: Targets = { dashboardHost: null, topbarHost: null };
const emptySummary: JobseekerAttentionSummary = {
  unanswered_interviews_count: 0,
  unread_messages_count: 0,
  pending_scouts_count: 0,
  next_interview: null,
  next_message: null,
  next_scout: null,
};

function ensureHost(parent: Element, marker: string, before?: Element | null) {
  const existing = parent.querySelector<HTMLElement>(`:scope > [data-hc-attention-host="${marker}"]`);
  if (existing) return existing;
  const host = document.createElement('span');
  host.dataset.hcAttentionHost = marker;
  host.className = `hc-attention-portal-host hc-attention-portal-host-${marker}`;
  if (before) parent.insertBefore(host, before);
  else parent.appendChild(host);
  return host;
}

function sameTargets(a: Targets, b: Targets) {
  return a.dashboardHost === b.dashboardHost && a.topbarHost === b.topbarHost;
}

function applicationTarget(applicationId: string | undefined | null, suffix = '') {
  return applicationId && UUID_PATTERN.test(applicationId)
    ? `/applications?application_id=${encodeURIComponent(applicationId)}${suffix}`
    : '/applications';
}

function interviewTarget(summary: JobseekerAttentionSummary) {
  const item = summary.next_interview;
  if (!item || !UUID_PATTERN.test(item.application_id) || !UUID_PATTERN.test(item.interview_id)) return '/applications';
  return `/applications?application_id=${encodeURIComponent(item.application_id)}&interview_id=${encodeURIComponent(item.interview_id)}#interview-${item.interview_id}`;
}

function messageTarget(summary: JobseekerAttentionSummary) {
  return applicationTarget(summary.next_message?.application_id, '#application-messages');
}

function scoutTarget(summary: JobseekerAttentionSummary) {
  const scoutId = summary.next_scout?.scout_id;
  return scoutId && UUID_PATTERN.test(scoutId)
    ? `/scouts?scout_id=${encodeURIComponent(scoutId)}#scout-inbox`
    : '/scouts';
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function AttentionSummaryEnhancer() {
  const [summary, setSummary] = useState<JobseekerAttentionSummary>(emptySummary);
  const [targets, setTargets] = useState<Targets>(emptyTargets);
  const markedApplications = useRef(new Set<string>());

  const load = useCallback(async () => {
    try {
      setSummary(await getJobseekerAttentionSummary());
    } catch {
      // Authentication may still be initializing. Keep the last safe snapshot and retry later.
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void load(), 450);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    const onRefresh = () => void load();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('hc:attention-refresh', onRefresh);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('hc:attention-refresh', onRefresh);
    };
  }, [load]);

  useEffect(() => {
    let scheduled = 0;
    const discover = () => {
      scheduled = 0;
      const metricGrid = document.querySelector('.metric-grid');
      const dashboardHost = metricGrid?.parentElement
        ? ensureHost(metricGrid.parentElement, 'dashboard', metricGrid)
        : null;

      const topbar = document.querySelector('.topbar');
      const notification = topbar?.querySelector('.notification-center') || null;
      const topbarHost = topbar ? ensureHost(topbar, 'topbar', notification) : null;
      const next = { dashboardHost, topbarHost };
      setTargets((current) => sameTargets(current, next) ? current : next);
    };

    const scheduleDiscover = () => {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(discover);
    };

    discover();
    const observer = new MutationObserver(scheduleDiscover);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', scheduleDiscover);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', scheduleDiscover);
      if (scheduled) window.cancelAnimationFrame(scheduled);
      document.querySelectorAll('[data-hc-attention-host]').forEach((node) => node.remove());
    };
  }, []);

  useEffect(() => {
    const onMessagesViewed = (event: Event) => {
      const detail = (event as CustomEvent<ApplicationMessagesViewedDetail>).detail;
      const applicationId = detail?.applicationId;
      if (!applicationId || !UUID_PATTERN.test(applicationId)) return;

      const selectedApplicationId = new URLSearchParams(window.location.search).get('application_id');
      if (selectedApplicationId !== applicationId || markedApplications.current.has(applicationId)) return;

      markedApplications.current.add(applicationId);
      void (async () => {
        try {
          const updated = await markJobseekerApplicationMessagesRead(applicationId);
          if (updated > 0) {
            await load();
            window.dispatchEvent(new CustomEvent('hc:notifications-refresh'));
          }
        } catch {
          markedApplications.current.delete(applicationId);
        }
      })();
    };

    window.addEventListener('hc:application-messages-viewed', onMessagesViewed);
    return () => window.removeEventListener('hc:application-messages-viewed', onMessagesViewed);
  }, [load]);

  const selectionCount = summary.unanswered_interviews_count + summary.unread_messages_count;
  const totalCount = selectionCount + summary.pending_scouts_count;
  const topbarTarget = summary.unanswered_interviews_count > 0
    ? interviewTarget(summary)
    : summary.unread_messages_count > 0
      ? messageTarget(summary)
      : scoutTarget(summary);

  return <>
    {targets.topbarHost && totalCount > 0 && createPortal(
      <a className="icon-button attention-topbar-link" href={topbarTarget} aria-label={`対応が必要な項目 ${totalCount}件`} title="今やること">
        <Icon name="shield" size={18} />
        <span className="attention-topbar-badge" aria-hidden="true">{totalCount > 99 ? '99+' : totalCount}</span>
      </a>,
      targets.topbarHost,
    )}

    {targets.dashboardHost && createPortal(
      <section className={`attention-dashboard ${totalCount > 0 ? 'has-attention' : ''}`} aria-label="今やること">
        <div className="attention-dashboard-head">
          <div><span className="eyebrow">NEXT ACTION</span><h2>今やること</h2></div>
          <strong>{totalCount > 0 ? `${totalCount}件の対応待ち` : '対応待ちはありません'}</strong>
        </div>
        <div className="attention-grid">
          <a className={`attention-item ${summary.unanswered_interviews_count > 0 ? 'has-count' : ''}`} href={interviewTarget(summary)}>
            <span className="attention-icon"><Icon name="clock" size={18} /></span>
            <span><small>面接</small><strong>未回答 {summary.unanswered_interviews_count}件</strong><em>{summary.next_interview?.facility_name || '面接予定を確認'}</em></span>
            <Icon name="chevron" size={14} />
          </a>
          <a className={`attention-item ${summary.unread_messages_count > 0 ? 'has-count' : ''}`} href={messageTarget(summary)}>
            <span className="attention-icon"><Icon name="bell" size={18} /></span>
            <span><small>園からの連絡</small><strong>未読 {summary.unread_messages_count}件</strong><em>{summary.next_message?.facility_name || 'メッセージを確認'}</em></span>
            <Icon name="chevron" size={14} />
          </a>
          <a className={`attention-item ${summary.pending_scouts_count > 0 ? 'has-count' : ''}`} href={scoutTarget(summary)}>
            <span className="attention-icon"><Icon name="sparkles" size={18} /></span>
            <span><small>匿名スカウト</small><strong>回答待ち {summary.pending_scouts_count}件</strong><em>{summary.next_scout?.facility_name || '届いたスカウトを確認'}</em></span>
            <Icon name="chevron" size={14} />
          </a>
        </div>
        {summary.next_interview?.scheduled_at && <p className="attention-next-note">次の未回答面接：{formatDateTime(summary.next_interview.scheduled_at)} {summary.next_interview.facility_name}</p>}
      </section>,
      targets.dashboardHost,
    )}
  </>;
}
