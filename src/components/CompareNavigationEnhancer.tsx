import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import './CompareNavigationEnhancer.css';

type Targets = { navHost: HTMLElement | null; dashboardHost: HTMLElement | null };
const emptyTargets: Targets = { navHost: null, dashboardHost: null };

function ensureHost(parent: Element, marker: string, before?: Element | null) {
  const existing = parent.querySelector<HTMLElement>(`:scope > [data-hc-compare-host="${marker}"]`);
  if (existing) return existing;
  const host = document.createElement('span');
  host.dataset.hcCompareHost = marker;
  host.className = `hc-compare-portal-host hc-compare-portal-host-${marker}`;
  if (before) parent.insertBefore(host, before);
  else parent.appendChild(host);
  return host;
}

function sameTargets(a: Targets, b: Targets) {
  return a.navHost === b.navHost && a.dashboardHost === b.dashboardHost;
}

export function CompareNavigationEnhancer() {
  const [targets, setTargets] = useState<Targets>(emptyTargets);

  useEffect(() => {
    let scheduled = 0;
    const discover = () => {
      scheduled = 0;
      const sideNav = document.querySelector('.side-nav');
      const existingCompare = sideNav?.querySelector<HTMLElement>(':scope > a[href="/compare"]') || null;
      let navHost: HTMLElement | null = null;
      if (sideNav && !existingCompare) {
        const matchLink = sideNav.querySelector(':scope > a[href="/matches"], :scope > [data-hc-match-host="nav"]');
        navHost = ensureHost(sideNav, 'nav', matchLink?.nextElementSibling || (sideNav.children.length >= 3 ? sideNav.children[2] : sideNav.lastElementChild));
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
      document.querySelectorAll('[data-hc-compare-host]').forEach((node) => node.remove());
    };
  }, []);

  return <>
    {targets.navHost && createPortal(
      <a className="nav-item compare-nav-item" data-compare-navigation="true" href="/compare"><Icon name="shield" size={18} /><span>園比較</span></a>,
      targets.navHost,
    )}
    {targets.dashboardHost && createPortal(
      <a className="compare-dashboard-callout" href="/compare">
        <span className="compare-dashboard-icon"><Icon name="shield" size={20} /></span>
        <span className="compare-dashboard-copy"><small>COMPARE</small><strong>2〜3園を、申告値と実績値を分けて比較</strong><span>給与・働き方・HO/HF Verifiedを横並びにして、見学前に確認できます。</span></span>
        <span className="compare-dashboard-action">園を比較 <Icon name="chevron" size={14} /></span>
      </a>,
      targets.dashboardHost,
    )}
  </>;
}
