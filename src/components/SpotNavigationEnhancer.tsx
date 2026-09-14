import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import './SpotNavigationEnhancer.css';

type Targets = {
  navHost: HTMLElement | null;
  dashboardHost: HTMLElement | null;
};

const emptyTargets: Targets = { navHost: null, dashboardHost: null };

function ensureHost(parent: Element, marker: string, before?: Element | null) {
  const existing = parent.querySelector<HTMLElement>(`:scope > [data-hc-spot-host="${marker}"]`);
  if (existing) return existing;
  const host = document.createElement('span');
  host.dataset.hcSpotHost = marker;
  host.className = `hc-spot-portal-host hc-spot-portal-host-${marker}`;
  if (before) parent.insertBefore(host, before);
  else parent.appendChild(host);
  return host;
}

function sameTargets(a: Targets, b: Targets) {
  return a.navHost === b.navHost && a.dashboardHost === b.dashboardHost;
}

export function SpotNavigationEnhancer() {
  const [targets, setTargets] = useState<Targets>(emptyTargets);

  useEffect(() => {
    let scheduled = 0;
    const discover = () => {
      scheduled = 0;
      const sideNav = document.querySelector('.side-nav');
      const existingSpotNav = sideNav?.querySelector(':scope > a[href="/spot-jobs"]');
      let navHost: HTMLElement | null = null;
      if (sideNav && !existingSpotNav) {
        const savedButton = Array.from(sideNav.children).find((node) => node.textContent?.includes('気になる')) || null;
        navHost = ensureHost(sideNav, 'nav', savedButton);
      }

      const metricGrid = document.querySelector('.metric-grid');
      let dashboardHost: HTMLElement | null = null;
      if (metricGrid?.parentElement) dashboardHost = ensureHost(metricGrid.parentElement, 'dashboard', metricGrid.nextElementSibling);

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
      document.querySelectorAll('[data-hc-spot-host]').forEach((node) => node.remove());
    };
  }, []);

  return <>
    {targets.navHost && createPortal(
      <a className="nav-item spot-nav-item" data-spot-navigation="true" href="/spot-jobs">
        <Icon name="clock" size={18} /><span>スポット求人</span>
      </a>,
      targets.navHost,
    )}
    {targets.dashboardHost && createPortal(
      <a className="spot-dashboard-callout" href="/spot-jobs">
        <span className="spot-dashboard-icon"><Icon name="clock" size={20} /></span>
        <span className="spot-dashboard-copy"><small>ONE-DAY WORK</small><strong>1日単位のスポット求人を見る</strong><span>勤務日・時間・時給・休憩を確認して応募できます。</span></span>
        <span className="spot-dashboard-action">スポットを探す <Icon name="chevron" size={14} /></span>
      </a>,
      targets.dashboardHost,
    )}
  </>;
}
