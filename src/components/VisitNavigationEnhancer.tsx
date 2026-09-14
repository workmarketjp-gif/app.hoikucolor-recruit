import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import './VisitNavigationEnhancer.css';

type Targets = { navHost: HTMLElement | null };
const emptyTargets: Targets = { navHost: null };

function ensureHost(parent: Element, before?: Element | null) {
  const existing = parent.querySelector<HTMLElement>(':scope > [data-hc-visit-host="nav"]');
  if (existing) return existing;
  const host = document.createElement('span');
  host.dataset.hcVisitHost = 'nav';
  host.className = 'hc-visit-portal-host';
  if (before) parent.insertBefore(host, before);
  else parent.appendChild(host);
  return host;
}

export function VisitNavigationEnhancer() {
  const [targets, setTargets] = useState<Targets>(emptyTargets);

  useEffect(() => {
    let scheduled = 0;
    const discover = () => {
      scheduled = 0;
      const sideNav = document.querySelector('.side-nav');
      const existingVisitNav = sideNav?.querySelector(':scope > a[href="/visits"]');
      let navHost: HTMLElement | null = null;
      if (sideNav && !existingVisitNav) {
        const profileItem = Array.from(sideNav.children).find((node) => node.textContent?.includes('プロフィール')) || null;
        navHost = ensureHost(sideNav, profileItem);
      }
      setTargets((current) => current.navHost === navHost ? current : { navHost });
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
      document.querySelectorAll('[data-hc-visit-host]').forEach((node) => node.remove());
    };
  }, []);

  if (!targets.navHost) return null;
  return createPortal(
    <a className={`nav-item visit-nav-item ${window.location.pathname.startsWith('/visits') ? 'active' : ''}`} data-visit-navigation="true" href="/visits">
      <Icon name="clock" size={18} /><span>見学・体験</span>
    </a>,
    targets.navHost,
  );
}
