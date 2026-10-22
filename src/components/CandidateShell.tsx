import { type ReactNode } from 'react';
import { Brand } from './Brand';
import { Icon } from './Icon';

export type ShellTab = 'jobs' | 'saved' | 'applications' | 'messages' | 'profile';

/**
 * The five fixed candidate destinations, identical on every screen size: a bottom tab
 * bar on mobile, the first group of the sidebar on desktop. Home (/) is the logo.
 */
export const shellTabs: { id: ShellTab; label: string; href: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { id: 'jobs', label: '求人を探す', href: '/jobs', icon: 'search' },
  { id: 'saved', label: '気になる', href: '/saved', icon: 'heart' },
  { id: 'applications', label: '応募管理', href: '/applications', icon: 'briefcase' },
  { id: 'messages', label: 'メッセージ', href: '/messages', icon: 'chat' },
  { id: 'profile', label: 'マイページ', href: '/profile', icon: 'user' },
];

/** Secondary destinations: desktop sidebar only; on mobile they live on My page and in context. */
export const secondaryLinks: { href: string; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { href: '/scouts', label: 'スカウト', icon: 'sparkles' },
  { href: '/visits', label: '見学・体験', icon: 'map' },
  { href: '/spot-jobs', label: 'スポット勤務', icon: 'clock' },
  { href: '/career', label: '転職シミュレーター', icon: 'yen' },
  { href: '/matches', label: 'マッチ度', icon: 'shield' },
  { href: '/compare', label: '園を比較', icon: 'file' },
];

/*
 * Layout contract (candidate-shell.css):
 *   < 900px   header (logo or back, title, notifications) + content + fixed 5-tab bottom nav; no sidebar.
 *   >= 900px  240px sidebar (logo, the same 5 destinations, secondary links, sign-out) + fluid main; no bottom nav.
 * Each destination appears once per layout. The shell uses only hc-* classes so legacy
 * dashboard rules (.sidebar, .nav-item, .main-column, .content) can never leak into it.
 */

type Props = {
  active: ShellTab | null;
  title: string;
  name: string;
  notification: ReactNode;
  badges?: Partial<Record<ShellTab, number>>;
  onNavigate?: (target: string) => void;
  /** Screens below a tab (details, secondary screens) show a back button in the header. */
  onBack?: () => void;
  onSignOut: () => void | Promise<void>;
  className?: string;
  children: ReactNode;
};

export function confirmSignOut(onSignOut: () => void | Promise<void>) {
  if (window.confirm('Hoiku Colorからログアウトしますか？')) void onSignOut();
}

export function CandidateShell({ active, title, name, notification, badges = {}, onNavigate, onBack, onSignOut, className, children }: Props) {
  const go = (href: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(href);
  };

  const secondaryActive = secondaryLinks.find((link) => window.location.pathname.startsWith(link.href)) ?? null;
  const badge = (count: number, className: string) => count > 0
    ? <em className={className} aria-label={`${count}件`}>{count > 99 ? '99+' : count}</em>
    : null;

  return (
    <div className={`hc-shell ${className ?? ''}`}>
      <aside className="hc-sidebar" aria-label="メニュー">
        <a className="hc-sidebar-brand" href="/" onClick={go('/')} aria-label="ホームへ"><Brand /></a>
        <nav className="hc-sidenav" aria-label="メインメニュー">
          {shellTabs.map((tab) => {
            const isActive = !secondaryActive && active === tab.id;
            return (
              <a key={tab.id} href={tab.href} className={`hc-sidenav-item ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={go(tab.href)}>
                <Icon name={tab.icon} size={20} />
                <span className="hc-sidenav-label">{tab.label}</span>
                {badge(badges[tab.id] ?? 0, 'hc-sidenav-badge')}
              </a>
            );
          })}
        </nav>
        <span className="hc-sidenav-divider" role="separator" />
        <nav className="hc-sidenav" aria-label="そのほかの機能">
          {secondaryLinks.map((link) => {
            const isActive = secondaryActive?.href === link.href;
            return (
              <a key={link.href} href={link.href} className={`hc-sidenav-item is-secondary ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined}>
                <Icon name={link.icon} size={20} />
                <span className="hc-sidenav-label">{link.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="hc-sidebar-account">
          <span className="hc-sidebar-name">{name}さん</span>
          <button type="button" className="hc-sidebar-signout" onClick={() => confirmSignOut(onSignOut)}>
            <Icon name="logout" size={18} /> ログアウト
          </button>
        </div>
      </aside>

      <div className="hc-main">
        <header className="hc-app-header">
          {onBack
            ? <button type="button" className="hc-header-back" onClick={onBack} aria-label="戻る"><Icon name="chevron" size={22} /></button>
            : <a className="hc-header-brand" href="/" onClick={go('/')} aria-label="ホームへ"><Brand compact /></a>}
          <h1 className="hc-header-title">{title}</h1>
          <div className="hc-header-actions">{notification}</div>
        </header>
        <main className="hc-content">{children}</main>
      </div>

      <nav className="hc-tabbar" aria-label="メインメニュー">
        {shellTabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <a key={tab.id} href={tab.href} className={`hc-tab ${isActive ? 'is-active' : ''}`} aria-current={isActive ? 'page' : undefined} onClick={go(tab.href)}>
              <span className="hc-tab-icon"><Icon name={tab.icon} size={24} />{badge(badges[tab.id] ?? 0, 'hc-tab-badge')}</span>
              <span className="hc-tab-label">{tab.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
