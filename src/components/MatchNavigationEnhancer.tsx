import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import './MatchNavigationEnhancer.css';

type Targets = {
  navHost: HTMLElement | null;
  dashboardHost: HTMLElement | null;
};

const emptyTargets: Targets = { navHost: null, dashboardHost: null };

function ensureHost(parent: Element, marker: string, before?: Element | null) {
  const existing = parent.querySelector<HTMLElement>(`:scope > [data-hc-match-host="${marker}"]`);
  if (existing) return existing;
  const host = document.createElement('span');
  host.dataset.hcMatchHost = marker;
  host.className = `hc-match-portal-host hc-match-portal-host-${marker}`;
  if (before) parent.insertBefore(host, before);
  else parent.appendChild(host);
  return host;
}

function sameTargets(a: Targets, b: Targets) {
  return a.navHost === b.navHost && a.dashboardHost === b.dashboardHost;
}

export function MatchNavigationEnhancer() {
  const [targets, setTargets] = useState<Targets>(emptyTargets);

  useEffect(() => {
    let scheduled = 0;
    const discover = () => {
      scheduled = 0;
      const sideNav = document.querySelector('.side-nav');
      const existingMatchNav = sideNav?.querySelector<HTMLElement>(':scope > a[href="/matches"]') || null;
      let navHost: HTMLElement | null = null;
      if (sideNav && !existingMatchNav) {
        const before = sideNav.children.length >= 3 ? sideNav.children[2] : sideNav.lastElementChild;
        navHost = ensureHost(sideNav, 'nav', before);
      }

      const metricGrid = document.querySelector('.metric-grid');
      let dashboardHost: HTMLElement | null = null;
      if (metricGrid?.parentElement) dashboardHost = ensureHost(metricGrid.parentElement, 'dashboard', metricGrid);

      const next = { navHost, dashboardHost };
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
      document.querySelectorAll('[data-hc-match-host]').forEach((node) => node.remove());
    };
  }, []);

  return <>
    {targets.navHost && createPortal(
      <a className="nav-item match-nav-item" data-match-navigation="true" href="/matches">
        <Icon name="sparkles" size={18} /><span>マッチング</span>
      </a>,
      targets.navHost,
    )}
    {targets.dashboardHost && createPortal(
      <a className="match-dashboard-callout" href="/matches">
        <span className="match-dashboard-icon"><Icon name="shield" size={20} /></span>
        <span className="match-dashboard-copy"><small>YOUR MATCH</small><strong>希望条件から、合う求人を先に見る</strong><span>勤務地・雇用形態・給与などを根拠つきで比較します。保育観は別枠で一致サインを表示します。</span></span>
        <span className="match-dashboard-action">おすすめを見る <Icon name="chevron" size={14} /></span>
      </a>,
      targets.dashboardHost,
    )}
  </>;
}
