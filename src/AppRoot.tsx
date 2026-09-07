import { ClerkProvider, SignOutButton, useAuth, useClerk, useSession, useSignIn, useSignUp, useUser } from '@clerk/react';
import { useEffect, useState, type FormEvent } from 'react';
import { App } from './App';
import { Brand } from './components/Brand';
import googleMark from './logo/google-g.svg';
import logoMark from './logo/logom_hoikucolor.png';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { setSupabaseAccessTokenGetter } from './lib/supabase';
import './auth-overrides.css';
import './auth-custom.css';

const publicUrl = (import.meta.env.VITE_HOIKU_COLOR_PUBLIC_URL || 'https://hoikucolor.jp').replace(/\/$/, '');
const poppyUrl = (import.meta.env.VITE_HOIKU_POPPY_URL || 'https://app.hoikupoppy.ai').replace(/\/$/, '');

const nurseryAuthPaths = [
  '/login/nursery',
  '/signup/nursery',
  '/sign-in/nursery',
  '/sign-up/nursery',
  '/nursery/login',
  '/nursery/signup',
  '/nursery/sign-in',
  '/nursery/sign-up',
  '/corporate/login',
  '/corporate/signup',
];

function isNurseryAuthPath(pathname: string) {
  const normalized = pathname.toLowerCase().replace(/\/$/, '') || '/';
  return nurseryAuthPaths.includes(normalized);
}

function authModeFromPath(pathname: string): 'signin' | 'signup' {
  const normalized = pathname.toLowerCase();
  return /(^|\/)(signup|sign-up|register)(\/|$)/.test(normalized) ? 'signup' : 'signin';
}

export function AppRoot() {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nurseryRedirect = isNurseryAuthPath(window.location.pathname);

  useEffect(() => {
    if (nurseryRedirect) {
      window.location.replace(poppyUrl);
      return;
    }

    let active = true;
    loadHoikuColorClerkPublishableKey()
      .then((value) => active && setKey(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'ログイン設定を取得できませんでした。'));
    return () => { active = false; };
  }, [nurseryRedirect]);

  if (nurseryRedirect) return <CenteredState title="Hoiku Poppyへ移動しています" body="園・法人のログイン・新規登録はHoiku Poppyをご利用ください。" loading />;
  if (error) return <CenteredState title="ログイン設定を読み込めませんでした" body={error} action="再読み込み" onAction={() => window.location.reload()} />;
  if (!key) return <CenteredState title="Hoiku Color" body="ログイン設定を読み込んでいます" loading />;

  return (
    <ClerkProvider publishableKey={key} signInUrl="/login" signUpUrl="/signup" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
      <AuthGate />
    </ClerkProvider>
  );
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

  useEffect(() => {
    const confirmSignOut = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const signOutButton = target.closest('button[title="ログアウト"]');
      if (!signOutButton) return;
      if (window.confirm('Hoiku Colorからログアウトしますか？')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener('click', confirmSignOut, true);
    return () => document.removeEventListener('click', confirmSignOut, true);
  }, []);

  if (!isLoaded) return <CenteredState title="Hoiku Color" body="ログイン状態を確認しています" loading />;
  if (window.location.pathname.startsWith('/sso-callback')) return <OAuthCallback />;
  if (!isSignedIn) return <LoginScreen />;

  if (user?.unsafeMetadata?.hoikuColorAccountType === 'nursery') {
    return (
      <CenteredState
        title="園・法人アカウントです"
        body="園・法人の管理画面はHoiku Poppyに統合されています。"
        action="Hoiku Poppyを開く"
        onAction={() => window.location.assign(poppyUrl)}
        secondary={<SignOutButton><button className="link-button" type="button" title="ログアウト">別のアカウントでログイン</button></SignOutButton>}
      />
    );
  }

  return <App />;
}

function OAuthCallback() {
  const clerk = useClerk();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    clerk.handleRedirectCallback({ signInFallbackRedirectUrl: '/', signUpFallbackRedirectUrl: '/' })
      .catch((err) => active && setError(authErrorMessage(err, 'Googleログインを完了できませんでした。')));
    return () => { active = false; };
  }, [clerk]);

  if (error) return <CenteredState title="Googleログインを完了できませんでした" body={error} action="ログイン画面へ戻る" onAction={() => window.location.assign('/login')} />;
  return <CenteredState title="Hoiku Color" body="Googleアカウントを確認しています" loading />;
}

function LoginScreen() {
  const isSignup = authModeFromPath(window.location.pathname) === 'signup';
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const busy = signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching';

  const finalizeSignIn = async () => {
    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setError('ログイン後に追加設定が必要です。もう一度お試しください。');
          return;
        }
        window.location.assign(decorateUrl('/'));
      },
    });
  };

  const finalizeSignUp = async () => {
    await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setError('アカウント作成後に追加設定が必要です。もう一度お試しください。');
          return;
        }
        window.location.assign(decorateUrl('/'));
      },
    });
  };

  const startGoogle = async () => {
    setError(null);
    try {
      const { error: ssoError } = await signIn.sso({
        strategy: 'oauth_google',
        redirectCallbackUrl: '/sso-callback',
        redirectUrl: '/',
      });
      if (ssoError) setError(authErrorMessage(ssoError, 'Googleログインを開始できませんでした。'));
    } catch (err) {
      setError(authErrorMessage(err, 'Googleログインを開始できませんでした。'));
    }
  };

  const startEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('メールアドレスを入力してください。');
      return;
    }
    setError(null);
    try {
      const { error: createError } = await signIn.create({ identifier: normalizedEmail, signUpIfMissing: true });
      if (createError) {
        setError(authErrorMessage(createError, 'メールアドレスを確認できませんでした。'));
        return;
      }
      const { error: sendError } = await signIn.emailCode.sendCode();
      if (sendError) {
        setError(authErrorMessage(sendError, '確認コードを送信できませんでした。'));
        return;
      }
      setStep('code');
    } catch (err) {
      setError(authErrorMessage(err, '確認コードを送信できませんでした。'));
    }
  };

  const verifyEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) {
      setError('確認コードを入力してください。');
      return;
    }
    setError(null);
    try {
      const { error: verifyError } = await signIn.emailCode.verifyCode({ code: code.trim() });
      if (verifyError) {
        if (authErrorCode(verifyError) === 'sign_up_if_missing_transfer') {
          const { error: transferError } = await signUp.create({ transfer: true });
          if (transferError) {
            setError(authErrorMessage(transferError, 'アカウントを作成できませんでした。'));
            return;
          }
          if (signUp.status === 'complete') {
            await finalizeSignUp();
            return;
          }
          setError('アカウント作成に追加情報が必要です。Googleログインをお試しいただくか、お問い合わせください。');
          return;
        }
        setError(authErrorMessage(verifyError, '確認コードが正しくありません。'));
        return;
      }
      if (signIn.status === 'complete') {
        await finalizeSignIn();
        return;
      }
      setError('ログインを完了できませんでした。もう一度お試しください。');
    } catch (err) {
      setError(authErrorMessage(err, 'ログインを完了できませんでした。'));
    }
  };

  const resendCode = async () => {
    setError(null);
    try {
      const { error: resendError } = await signIn.emailCode.sendCode();
      if (resendError) setError(authErrorMessage(resendError, '確認コードを再送信できませんでした。'));
    } catch (err) {
      setError(authErrorMessage(err, '確認コードを再送信できませんでした。'));
    }
  };

  const resetEmail = () => {
    signIn.reset();
    setCode('');
    setStep('email');
    setError(null);
  };

  return (
    <main className="hc-auth-page">
      <section className="hc-auth-shell">
        <aside className="hc-auth-story">
          <a className="hc-auth-logo" href={publicUrl}><Brand /></a>
          <div className="hc-auth-story-copy">
            <span className="hc-auth-eyebrow">FOR JOB SEEKERS</span>
            <h1>自分に合う保育園と、<br />もっと自然につながる。</h1>
            <p>求人の保存、応募、見学・体験勤務まで。あなたの転職活動をHoiku Colorでまとめて管理できます。</p>
            <div className="hc-auth-pills"><span>求人検索</span><span>気になる保存</span><span>応募管理</span></div>
          </div>
        </aside>

        <section className="hc-auth-main">
          <div className="hc-auth-mobile-logo"><Brand /></div>
          <div className="hc-auth-role">求職者専用</div>
          <header className="hc-auth-heading">
            <span>求職者</span>
            <h2>{isSignup ? '求職者アカウントを作成' : '求職者ログイン'}</h2>
            <p>Googleアカウントまたはメールアドレスで続けられます。</p>
          </header>

          <div className="hc-auth-form-area">
            {step === 'email' ? (
              <>
                <button className="hc-google-button" type="button" onClick={startGoogle} disabled={busy}>
                  <img className="hc-google-mark" src={googleMark} alt="" aria-hidden="true" />
                  <span>Googleで続ける</span>
                </button>
                <div className="hc-auth-divider"><span>または</span></div>
                <form className="hc-email-form" onSubmit={startEmail}>
                  <label htmlFor="hc-email">メールアドレス</label>
                  <input
                    id="hc-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.jp"
                    disabled={busy}
                  />
                  {error && <p className="hc-auth-error" role="alert">{error}</p>}
                  <button className="hc-auth-primary" type="submit" disabled={busy}>{busy ? '送信中…' : 'メールで続ける'}</button>
                </form>
              </>
            ) : (
              <form className="hc-email-form hc-code-form" onSubmit={verifyEmail}>
                <div className="hc-code-copy">
                  <strong>確認コードを入力</strong>
                  <p><b>{email}</b> に送信した6桁のコードを入力してください。</p>
                </div>
                <label htmlFor="hc-code">確認コード</label>
                <input
                  id="hc-code"
                  className="hc-code-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="000000"
                  disabled={busy}
                />
                {error && <p className="hc-auth-error" role="alert">{error}</p>}
                <button className="hc-auth-primary" type="submit" disabled={busy}>{busy ? '確認中…' : '確認して続ける'}</button>
                <div className="hc-code-actions">
                  <button type="button" onClick={resendCode} disabled={busy}>コードを再送</button>
                  <button type="button" onClick={resetEmail} disabled={busy}>メールアドレスを変更</button>
                </div>
              </form>
            )}

            <div id="clerk-captcha" />
          </div>

          <div className="hc-auth-footer-links">
            <a href={isSignup ? '/login' : '/signup'}>{isSignup ? 'すでにアカウントをお持ちの方' : 'アカウントをお持ちでない方'}</a>
            <a href={poppyUrl}>園・法人の方はこちら</a>
          </div>
        </section>
      </section>
    </main>
  );
}

function authErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { errors?: Array<{ code?: string }> };
  return candidate.errors?.[0]?.code || null;
}

function authErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const candidate = error as { message?: string; errors?: Array<{ longMessage?: string; message?: string }> };
  return candidate.errors?.[0]?.longMessage || candidate.errors?.[0]?.message || candidate.message || fallback;
}

function CenteredState({ title, body, action, onAction, loading, secondary }: { title: string; body: string; action?: string; onAction?: () => void; loading?: boolean; secondary?: React.ReactNode }) {
  return (
    <main className="centered-state"><section className="centered-card">
      <Brand />
      {loading && <img className="hc-loading-logo" src={logoMark} alt="" aria-hidden="true" />}
      <h1>{title}</h1><p>{body}</p>
      {action && <button className="primary-button" type="button" onClick={onAction}>{action}</button>}
      {secondary}
    </section></main>
  );
}
