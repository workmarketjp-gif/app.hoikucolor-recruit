import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Brand } from './Brand';
import { Icon } from './Icon';

export type ShellTab = 'home' | 'jobs' | 'saved' | 'applications' | 'profile';

/** The five fixed candidate destinations. Everything else is reached from these screens. */
export const shellTabs: { id: ShellTab; label: string; href: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'home', label: 'ホーム', href: '/', icon: 'home' },
  { id: 'jobs', label: '求人', href: '/jobs', icon: 'search' },
  { id: 'saved', label: '気になる', href: '/saved', icon: 'heart' },
  { id: 'applications', label: '応募', href: '/applications', icon: 'briefcase' },
  { id: 'profile', label: 'マイページ', href: '/profile', icon: 'user' },
];

/** Secondary destinations: desktop sidebar only; on mobile they live on Home / My page. */
export const secondaryLinks: { href: string; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { href: '/scouts', label: 'スカウト', icon: 'sparkles' },
  { href: '/visits', label: '見学・体験', icon: 'map' },
  { href: '/spot-jobs', label: 'スポット勤務', icon: 'clock' },
  { href: '/matches', label: 'マッチ度', icon: 'shield' },
  { href: '/compare', label: '園を比較', icon: 'file' },
];

/*
 * Layout contract (candidate-shell.css):
 *   < 900px   header + content + fixed 5-tab bottom nav; no sidebar.
 *   >= 900px  240px sidebar (icon + label rows, every destination) + fluid main; no bottom nav.
 * The shell uses only hc-* classes so legacy dashboard rules (.sidebar, .nav-item,
 * .main-column, .content) can never leak into it.
 */

type Props = {
  active: ShellTab | null;
  title: string;
  name: string;
  email?: string | null;
  notification: ReactNode;
  badges?: Partial<Record<ShellTab, number>>;
  onNavigate?: (tab: ShellTab) => void;
  /** Screens below a tab (details, secondary screens) show a back button in the header. */
  onBack?: () => void;
  onSignOut: () => void | Promise<void>;
  className?: string;
  children: ReactNode;
};

export function CandidateShell({ active, title, name, email, notification, badges = {}, onNavigate, onBack, onSignOut, className, children }: Props) {
  const [accountOpen, setAccountOpen] = useState(false);

  const go = (tab: ShellTab) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(tab);
  };

  const secondaryActive = secondaryLinks.find((link) => window.location.pathname.startsWith(link.href)) ?? null;

  const sideLink = (key: string, href: string, label: string, icon: Parameters<typeof Icon>[0]['name'], isActive: boolean, count = 0, onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void) => (
    <a key={key} href={href} className={`hc-sidenav-item ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span className="hc-sidenav-label">{label}</span>
      {count > 0 && <em className="hc-sidenav-badge" aria-label={`${count}件`}>{count > 99 ? '99+' : count}</em>}
    </a>
  );

  const bottomTab = (tab: (typeof shellTabs)[number]) => {
    const count = badges[tab.id] ?? 0;
    const isActive = active === tab.id;
    return (
      <a key={tab.id} href={tab.href} className={`hc-tab ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={go(tab.id)}>
        <Icon name={tab.icon} size={22} />
        <span>{tab.label}</span>
        {count > 0 && <i className="hc-tab-badge" aria-label={`${count}件`}>{count > 99 ? '99+' : count}</i>}
      </a>
    );
  };

  return (
    <div className={`hc-shell ${className ?? ''}`}>
      <aside className="hc-sidebar" aria-label="メニュー">
        <a className="hc-sidebar-brand" href="/" onClick={go('home')}><Brand /></a>
        <nav className="hc-sidenav" aria-label="マイページ">
          {shellTabs.map((tab) => sideLink(tab.id, tab.href, tab.label, tab.icon, !secondaryActive && active === tab.id, badges[tab.id] ?? 0, go(tab.id)))}
          <span className="hc-sidenav-divider" role="separator" />
          {secondaryLinks.map((link) => {
            const isActive = window.location.pathname.startsWith(link.href);
            return sideLink(link.href, link.href, link.label, link.icon, isActive);
          })}
        </nav>
      </aside>

      <div className="hc-main">
        <header className="hc-app-header">
          {onBack
            ? <button type="button" className="icon-button hc-header-back" onClick={onBack} aria-label="戻る"><Icon name="chevron" size={22} /></button>
            : <a className="hc-header-brand" href="/" onClick={go('home')} aria-label="ホームへ"><Brand compact /></a>}
          <h1 className="hc-header-title">{title}</h1>
          <div className="hc-header-actions">
            {notification}
            <button type="button" className="icon-button hc-account-button" aria-label="アカウント" aria-haspopup="dialog" aria-expanded={accountOpen} onClick={() => setAccountOpen(true)}>
              <Icon name="user" size={20} />
            </button>
          </div>
        </header>
        <main className="hc-content">{children}</main>
      </div>

      <nav className="hc-tabbar" aria-label="メインメニュー">
        {shellTabs.map(bottomTab)}
      </nav>

      {accountOpen && <AccountSheet name={name} email={email} onClose={() => setAccountOpen(false)} onSignOut={onSignOut} />}
    </div>
  );
}

function AccountSheet({ name, email, onClose, onSignOut }: { name: string; email?: string | null; onClose: () => void; onSignOut: () => void | Promise<void> }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="hc-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="hc-sheet" role="dialog" aria-modal="true" aria-labelledby="hc-account-title" onClick={(event) => event.stopPropagation()}>
        <div className="hc-sheet-head">
          <strong id="hc-account-title">{name}</strong>
          {email && <span>{email}</span>}
        </div>
        <a className="hc-sheet-item" href="/profile" onClick={onClose}>マイページ</a>
        <a className="hc-sheet-item" href="/scouts" onClick={onClose}>スカウト</a>
        <a className="hc-sheet-item" href="/visits" onClick={onClose}>見学・体験の予約</a>
        <button
          type="button"
          className="hc-sheet-item is-danger"
          onClick={() => {
            if (window.confirm('Hoiku Colorからログアウトしますか？')) void onSignOut();
          }}
        >
          ログアウト
        </button>
        <button type="button" className="hc-sheet-item is-subtle" onClick={onClose}>閉じる</button>
      </div>
    </div>,
    document.body,
  );
}
