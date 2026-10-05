import { ClerkProvider, useAuth, useClerk, useSession, useUser } from '@clerk/react';
import { useEffect, useState, useLayoutEffect } from 'react';
import { Brand } from './components/Brand';
import { Icon } from './components/Icon';
import { AppLoading } from './components/AppLoading';
import { CandidateShell } from './components/CandidateShell';
import { NotificationCenter } from './components/NotificationCenter';
import { ProfileMatchingPreferencesPanel } from './components/ProfileMatchingPreferencesPanel';
import { ScoutInbox } from './components/ScoutInbox';
import { ScoutPrivacyPanel } from './components/ScoutPrivacyPanel';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { setSupabaseAccessTokenGetter } from './lib/supabase';
import './ScoutRouteRoot.css';

const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const poppyUrl = (import.meta.env.VITE_HOIKU_POPPY_URL || 'https://app.hoikupoppy.ai').replace(/\/$/, '');

const navItems = [
  { href: '/', label: 'ホーム', icon: 'home' as const },
  { href: '/jobs', label: '求人を探す', icon: 'search' as const },
  { href: '/saved', label: '気になる', icon: 'heart' as const },
  { href: '/applications', label: '応募管理', icon: 'briefcase' as const },
  { href: '/scouts', label: 'スカウト', icon: 'sparkles' as const },
  { href: '/profile', label: 'プロフィール', icon: 'user' as const },
];

export function ScoutRouteRoot() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHoikuColorClerkPublishableKey()
      .then((value) => active && setKey(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'ログイン設定を取得できませんでした。'));
    return () => { active = false; };
  }, []);

  if (error) return <ScoutRouteState title="ログイン設定を読み込めませんでした" body={error} action="再読み込み" onAction={() => window.location.reload()} />;
  if (!key) return <AppLoading />;

  return (
    <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/scouts" signUpFallbackRedirectUrl="/scouts">
      <ScoutRouteGate />
    </ClerkProvider>
  );
}

function ScoutRouteGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { user } = useUser();
  const { signOut } = useClerk();

  useLayoutEffect(() => {
    if (!session) {
      setSupabaseAccessTokenGetter(null);
      return;
    }
    setSupabaseAccessTokenGetter(() => session.getToken());
    return () => setSupabaseAccessTokenGetter(null);
  }, [session]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) window.location.replace('/login');
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || !isSignedIn) return <AppLoading />;

  if (user?.unsafeMetadata?.hoikuColorAccountType === 'nursery') {
    return <ScoutRouteState title="園・法人アカウントです" body="園・法人の管理画面はHoiku Poppyをご利用ください。" action="Hoiku Poppyを開く" onAction={() => window.location.assign(poppyUrl)} />;
  }

  const displayName = user?.fullName || user?.firstName || 'ゲスト';
  const navigateNotification = (target: string) => window.location.assign(target);

  return (
    <CandidateShell
      active={null}
      title="スカウト"
      name={displayName}
      email={user?.primaryEmailAddress?.emailAddress ?? null}
      onSignOut={() => signOut({ redirectUrl: '/login' })}
      notification={<NotificationCenter onNavigate={(target) => window.location.assign(target)} />}
      className="scout-route-shell"
    >
        <section className="scout-route-content">
          <header className="page-heading scout-route-heading">
            <div><span className="eyebrow">ANONYMOUS SCOUT</span><h1>スカウト</h1><p>匿名のまま園からのお誘いを確認できます。承諾するまで氏名・メール・電話番号は共有されません。</p></div>
            <a className="secondary-button" href="/jobs"><Icon name="search" size={15} /> 求人も探す</a>
          </header>

          <ScoutInbox />

          <section className="scout-route-settings" aria-label="スカウト設定">
            <div className="scout-route-settings-head"><span className="eyebrow">SCOUT SETTINGS</span><h2>スカウト設定</h2><p>公開範囲と希望条件を整えると、あなたに合う園からのお誘いにつながりやすくなります。</p></div>
            <ScoutPrivacyPanel />
            <ProfileMatchingPreferencesPanel />
          </section>
        </section>
    </CandidateShell>
  );
}

function ScoutRouteState({ title, body, loading, action, onAction }: { title: string; body: string; loading?: boolean; action?: string; onAction?: () => void }) {
  return <div className="scout-route-state">{loading && <span className="loading-ring" />}<Brand /><h1>{title}</h1><p>{body}</p>{action && onAction && <button className="primary-button" type="button" onClick={onAction}>{action}</button>}</div>;
}
