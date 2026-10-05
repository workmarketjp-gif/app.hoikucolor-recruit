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
const secondaryLinks = [
  { href: '/scouts', label: 'スカウト' },
  { href: '/visits', label: '見学・体験' },
  { href: '/spot-jobs', label: 'スポット勤務' },
  { href: '/matches', label: 'マッチ度' },
  { href: '/compare', label: '園を比較' },
];

type Props = {
  active: ShellTab | null;
  title: string;
  name: string;
  email?: string | null;
  notification: ReactNode;
  badges?: Partial<Record<ShellTab, number>>;
  onNavigate?: (tab: ShellTab) => void;
  onSignOut: () => void | Promise<void>;
  className?: string;
  children: ReactNode;
};

export function CandidateShell({ active, title, name, email, notification, badges = {}, onNavigate, onSignOut, className, children }: Props) {
  const [accountOpen, setAccountOpen] = useState(false);

  const go = (tab: ShellTab) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(tab);
  };

  const tabLink = (tab: (typeof shellTabs)[number], variant: 'side' | 'bottom') => {
    const count = badges[tab.id] ?? 0;
    const isActive = active === tab.id;
    return (
      <a
        key={tab.id}
        href={tab.href}
        className={variant === 'side' ? `nav-item ${isActive ? 'active' : ''}` : `hc-tab ${isActive ? 'is-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={go(tab.id)}
      >
        <Icon name={tab.icon} size={variant === 'side' ? 18 : 22} />
        <span>{tab.label}</span>
        {count > 0 && (variant === 'side' ? <em>{count}</em> : <i className="hc-tab-badge" aria-label={`${count}件`}>{count > 99 ? '99+' : count}</i>)}
      </a>
    );
  };

  return (
    <div className={`app-shell hc-shell ${className ?? ''}`}>
      <aside className="sidebar hc-sidebar">
        <a className="sidebar-brand" href="/" onClick={go('home')}><Brand /></a>
        <nav className="side-nav" aria-label="マイページ">
          {shellTabs.map((tab) => tabLink(tab, 'side'))}
          {secondaryLinks.map((link) => {
            const isActive = window.location.pathname.startsWith(link.href);
            return <a key={link.href} className={`nav-item hc-nav-secondary ${isActive ? 'active' : ''}`} aria-current={isActive ? 'page' : undefined} href={link.href}><span>{link.label}</span></a>;
          })}
        </nav>
      </aside>

      <main className="main-column">
        <header className="hc-app-header">
          <a className="hc-header-brand" href="/" onClick={go('home')} aria-label="ホームへ"><Brand compact /></a>
          <h1 className="hc-header-title">{title}</h1>
          <div className="hc-header-actions">
            {notification}
            <button type="button" className="icon-button hc-account-button" aria-label="アカウント" aria-haspopup="dialog" aria-expanded={accountOpen} onClick={() => setAccountOpen(true)}>
              <Icon name="user" size={20} />
            </button>
          </div>
        </header>
        <section className="content hc-content">{children}</section>
      </main>

      <nav className="hc-tabbar" aria-label="メインメニュー">
        {shellTabs.map((tab) => tabLink(tab, 'bottom'))}
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
        <a className="hc-sheet-item" href="/profile">マイページ</a>
        <a className="hc-sheet-item" href="/scouts">スカウト</a>
        <a className="hc-sheet-item" href="/visits">見学・体験の予約</a>
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
