import { ClerkProvider, SignIn, SignOutButton, SignUp, useAuth, useSession, useUser } from '@clerk/react';
import { useEffect, useState } from 'react';
import { App } from './App';
import { Brand } from './components/Brand';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { setSupabaseAccessTokenGetter } from './lib/supabase';

const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const poppyUrl = (import.meta.env.VITE_HOIKU_POPPY_URL || 'https://app.hoikupoppy.ai').replace(/\/$/, '');

export function AppRoot() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHoikuColorClerkPublishableKey()
      .then((value) => active && setKey(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'ログイン設定を取得できませんでした。'));
    return () => { active = false; };
  }, []);

  if (error) return <CenteredState title="ログイン設定を読み込めませんでした" body={error} action="再読み込み" onAction={() => window.location.reload()} />;
  if (!key) return <CenteredState title="Hoiku Color" body="ログイン設定を読み込んでいます" loading />;

  return <ClerkProvider publishableKey={key}><AuthGate /></ClerkProvider>;
}

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { user } = useUser();

  useEffect(() => {
    if (!session) {
      setSupabaseAccessTokenGetter(null);
      return;
    }
    setSupabaseAccessTokenGetter(() => session.getToken());
    return () => setSupabaseAccessTokenGetter(null);
  }, [session]);

  if (!isLoaded) return <CenteredState title="Hoiku Color" body="ログイン状態を確認しています" loading />;
  if (!isSignedIn) return <LoginScreen />;

  if (user?.unsafeMetadata?.hoikuColorAccountType === 'nursery') {
    return (
      <CenteredState
        title="園・法人アカウントです"
        body="園・法人の管理画面は Hoiku Poppy に統合されています。"
        action="Hoiku Poppyを開く"
        onAction={() => window.location.assign(poppyUrl)}
        secondary={<SignOutButton><button className="link-button" type="button">別のアカウントでログイン</button></SignOutButton>}
      />
    );
  }

  return <App />;
}

function LoginScreen() {
  const isSignup = window.location.pathname.startsWith('/signup');
  const appearance = {
    variables: { colorPrimary: '#fb2f52', borderRadius: '12px' },
    elements: {
      rootBox: 'clerk-root', cardBox: 'clerk-box', card: 'clerk-card',
      headerTitle: 'clerk-hidden', headerSubtitle: 'clerk-hidden', footer: 'clerk-footer',
    },
  } as const;

  return (
    <main className="login-page">
      <section className="login-shell">
        <aside className="login-brand-panel">
          <a className="login-logo" href={publicUrl}><Brand /></a>
          <div className="login-copy">
            <span>FOR JOB SEEKERS</span>
            <h1>自分に合う保育園と、<br />もっと自然につながる。</h1>
            <p>求人の保存、応募、見学・体験勤務まで。あなたの転職活動をHoiku Colorでまとめて管理できます。</p>
          </div>
          <div className="login-pills"><span>求人検索</span><span>気になる保存</span><span>応募管理</span></div>
        </aside>

        <section className="login-form-panel">
          <div className="mobile-login-logo"><Brand /></div>
          <div className="login-type-label">求職者</div>
          <header className="login-heading">
            <span>求職者</span>
            <h2>{isSignup ? '求職者アカウントを作成' : '求職者ログイン'}</h2>
            <p>{isSignup ? 'メールアドレスまたはGoogleで無料登録できます。' : '登録済みのアカウントでログインしてください。'}</p>
          </header>

          {isSignup ? (
            <SignUp routing="hash" signInUrl="/login" forceRedirectUrl="/" unsafeMetadata={{ hoikuColorAccountType: 'jobseeker' }} appearance={appearance} />
          ) : (
            <SignIn routing="hash" signUpUrl="/signup" forceRedirectUrl="/" appearance={appearance} />
          )}

          <div className="login-secondary-links">
            <a href={isSignup ? '/login' : '/signup'}>{isSignup ? 'すでにアカウントをお持ちの方' : 'アカウントをお持ちでない方'}</a>
            <a href={poppyUrl}>園・法人の方はこちら</a>
          </div>
        </section>
      </section>
    </main>
  );
}

function CenteredState({ title, body, action, onAction, loading, secondary }: { title: string; body: string; action?: string; onAction?: () => void; loading?: boolean; secondary?: React.ReactNode }) {
  return (
    <main className="centered-state"><section className="centered-card">
      <Brand />
      {loading && <span className="loading-ring" />}
      <h1>{title}</h1><p>{body}</p>
      {action && <button className="primary-button" type="button" onClick={onAction}>{action}</button>}
      {secondary}
    </section></main>
  );
}
