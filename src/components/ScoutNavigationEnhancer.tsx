import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { listJobseekerScouts } from '../lib/scoutInboxRepository';
import './ScoutNavigationEnhancer.css';

type Targets = {
  navHost: HTMLElement | null;
  existingScoutNav: HTMLElement | null;
  dashboardHost: HTMLElement | null;
  topbarHost: HTMLElement | null;
};

const emptyTargets: Targets = { navHost: null, existingScoutNav: null, dashboardHost: null, topbarHost: null };

function ensureHost(parent: Element, marker: string, before?: Element | null) {
  const existing = parent.querySelector<HTMLElement>(`:scope > [data-hc-scout-host="${marker}"]`);
  if (existing) return existing;
  const host = document.createElement('span');
  host.dataset.hcScoutHost = marker;
  host.className = `hc-scout-portal-host hc-scout-portal-host-${marker}`;
  if (before) parent.insertBefore(host, before);
  else parent.appendChild(host);
  return host;
}

function sameTargets(a: Targets, b: Targets) {
  return a.navHost === b.navHost && a.existingScoutNav === b.existingScoutNav && a.dashboardHost === b.dashboardHost && a.topbarHost === b.topbarHost;
}

export function ScoutNavigationEnhancer() {
  const [pendingCount, setPendingCount] = useState(0);
  const [targets, setTargets] = useState<Targets>(emptyTargets);

  useEffect(() => {
    let stopped = false;
    let retryTimer: number | null = null;

    const load = async () => {
      try {
        const scouts = await listJobseekerScouts();
        if (!stopped) setPendingCount(scouts.filter((scout) => scout.scout_status === 'pending').length);
      } catch {
        if (!stopped) retryTimer = window.setTimeout(load, 3000);
      }
    };

    const initialTimer = window.setTimeout(load, 350);
    const refreshTimer = window.setInterval(load, 60000);
    const onVisibility = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    let scheduled = 0;
    const discover = () => {
      scheduled = 0;
      const sideNav = document.querySelector('.side-nav');
      const existingScoutNav = sideNav?.querySelector<HTMLElement>(':scope > a[href="/scouts"]') || null;
      let navHost: HTMLElement | null = null;
      if (sideNav && !existingScoutNav) navHost = ensureHost(sideNav, 'nav', sideNav.lastElementChild);

      const metricGrid = document.querySelector('.metric-grid');
      let dashboardHost: HTMLElement | null = null;
      if (metricGrid?.parentElement) dashboardHost = ensureHost(metricGrid.parentElement, 'dashboard', metricGrid);

      const topbar = document.querySelector('.topbar');
      let topbarHost: HTMLElement | null = null;
      if (topbar) {
        const notification = topbar.querySelector('.notification-center');
        topbarHost = ensureHost(topbar, 'topbar', notification);
      }

      const next = { navHost, existingScoutNav, dashboardHost, topbarHost };
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
      document.querySelectorAll('[data-hc-scout-host]').forEach((node) => node.remove());
    };
  }, []);

  const badge = pendingCount > 0 ? <em aria-label={`回答待ちスカウト${pendingCount}件`}>{pendingCount > 99 ? '99+' : pendingCount}</em> : null;

  return <>
    {targets.navHost && createPortal(
      <a className="nav-item scout-nav-item" data-scout-navigation="true" href="/scouts">
        <Icon name="sparkles" size={18} /><span>スカウト</span>{badge}
      </a>,
      targets.navHost,
    )}

    {targets.existingScoutNav && pendingCount > 0 && createPortal(
      <span className="scout-existing-nav-badge" aria-label={`回答待ちスカウト${pendingCount}件`}>{pendingCount > 99 ? '99+' : pendingCount}</span>,
      targets.existingScoutNav,
    )}

    {targets.topbarHost && createPortal(
      <a className="icon-button scout-topbar-link" href="/scouts" aria-label={pendingCount ? `スカウト 回答待ち${pendingCount}件` : 'スカウト'} title="スカウト">
        <Icon name="sparkles" size={18} />
        {pendingCount > 0 && <span className="scout-topbar-badge">{pendingCount > 99 ? '99+' : pendingCount}</span>}
      </a>,
      targets.topbarHost,
    )}

    {targets.dashboardHost && createPortal(
      <a className={`scout-dashboard-callout ${pendingCount > 0 ? 'has-pending' : ''}`} href="/scouts">
        <span className="scout-dashboard-icon"><Icon name="sparkles" size={20} /></span>
        <span className="scout-dashboard-copy">
          <small>ANONYMOUS SCOUT</small>
          <strong>{pendingCount > 0 ? `回答待ちのスカウトが${pendingCount}件あります` : '匿名スカウトを確認する'}</strong>
          <span>{pendingCount > 0 ? '園から届いたお誘いを確認して、承諾または辞退できます。' : '承諾するまで氏名・メール・電話番号は園に共有されません。'}</span>
        </span>
        <span className="scout-dashboard-action">{pendingCount > 0 ? '確認する' : 'スカウトを見る'} <Icon name="chevron" size={14} /></span>
      </a>,
      targets.dashboardHost,
    )}
  </>;
}
