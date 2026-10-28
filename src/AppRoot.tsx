import { ClerkProvider, SignOutButton, useAuth, useClerk, useSession, useSignIn, useSignUp, useUser } from '@clerk/react';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState, type FormEvent } from 'react';
import { App } from './App';
import { PrivateRecruitmentRoute, privateTestScope } from './PrivateRecruitmentRoute';
import { AppLoading } from './components/AppLoading';
import { CandidateSessionProvider, type CandidateSession } from './lib/candidateSession';
import { Brand } from './components/Brand';
import googleMark from './logo/google-g.svg';
import logoMark from './logo/logom_hoikucolor.png';
import { loadHoikuColorClerkPublishableKey } from './lib/clerkConfig';
import { authEntryFromUrl, rememberReturnTarget, restoreReturnTarget } from './lib/router';
import { setSupabaseAccessTokenGetter } from './lib/supabase';
import { reportVerifiedSignup, track } from './lib/analytics';
import { captureHandoffFromLocation, readPendingHandoff } from './lib/preferenceHandoff';
import { getJobseekerMatchingPreferences } from './lib/profilePreferencesRepository';
import './auth-overrides.css';
import './auth-custom.css';

// Test-only harness. `import.meta.env.MODE` is replaced at build time, so production
// bundles drop this branch (and the e2e module) entirely.
// Finder choices from hoikucolor.jp (?hc_values=…) are stored before anything renders,
// so they survive the login screen, email codes, the Google redirect and refreshes.
captureHandoffFromLocation();

const E2ERoot = import.meta.env.MODE === 'e2e' ? lazy(() => import('./e2e/E2ERoot')) : null;

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
  if (E2ERoot) return <Suspense fallback={<AppLoading />}><E2ERoot /></Suspense>;
  return <ClerkAppRoot />;
}

function ClerkAppRoot() {
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
  if (!key) return <AppLoading />;

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
  const clerk = useClerk();

  // Layout effects run before any child passive effect, so the token getter is in
  // place before the first candidate RPC fires (no unauthenticated first request).
  useLayoutEffect(() => {
    if (!session) {
      setSupabaseAccessTokenGetter(null);
      return;
    }
    setSupabaseAccessTokenGetter(() => session.getToken());
    return () => setSupabaseAccessTokenGetter(null);
  }, [session]);

  const candidate = useMemo<CandidateSession | null>(() => user ? {
    userId: user.id,
    firstName: user.firstName ?? null,
    fullName: user.fullName ?? null,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    signOut: () => clerk.signOut({ redirectUrl: '/login' }),
  } : null, [user, clerk]);

  useEffect(() => {
    if (!user) return;
    const fromAuthScreen = consumeAuthAttempt();
    const evidence = {
      userId: user.id,
      createdAt: user.createdAt ?? null,
      emailVerified: user.primaryEmailAddress?.verification?.status === 'verified',
      method: (user.externalAccounts?.length ? 'google' : 'email') as 'google' | 'email',
    };
    // sign_up needs a verified Clerk account AND a successful authenticated Supabase call.
    void reportVerifiedSignup(evidence, getJobseekerMatchingPreferences).then((reported) => {
      if (!reported && fromAuthScreen) track('login', { method: evidence.method });
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) return <AppLoading />;
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

  if (!candidate) return <AppLoading />;
  restoreReturnTarget();
  const testScope = privateTestScope(window.location.pathname);
  return <CandidateSessionProvider value={candidate}>{testScope ? <PrivateRecruitmentRoute key={`${candidate.userId}:${testScope}`} scopeId={testScope} name={candidate.fullName || ''}/> : <App />}</CandidateSessionProvider>;
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
  return <AppLoading />;
}

/**
 * What the visitor came for, by return screen. One promise per screen; registration itself
 * still needs only an email address or Google (career details are optional, after login).
 */
const entryPromises: Partial<Record<string, { title: string; body: string }>> = {
  career: { title: 'あなたの給与と休日を、地域の求人と比べる。', body: '無料登録のあと、そのまま比較の画面に戻ります。給与の入力は任意で、あなただけが見られます。' },
  jobs: { title: '気になる求人を、保存して比べる。', body: '無料登録のあと、見ていた求人に戻ります。' },
  compare: { title: '給与・休日・働き方を、無料で比較する。', body: '無料登録のあと、比較の画面に戻ります。' },
  saved: { title: '気になる園を、保存しておく。', body: '無料登録のあと、気になるリストに戻ります。' },
};

function LoginScreen() {
  const isSignup = authModeFromPath(window.location.pathname) === 'signup';
  const [promise] = useState(() => entryPromises[authEntryFromUrl(window.location.pathname, window.location.search).entry ?? ''] ?? null);
  const { signIn, fetchStatus: signInFetchStatus } = useSignIn();
  const { signUp, fetchStatus: signUpFetchStatus } = useSignUp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState<string | null>(null);
  const busy = signInFetchStatus === 'fetching' || signUpFetchStatus === 'fetching';
  const [handoff] = useState(() => readPendingHandoff());

  // A signed-out visit to a candidate deep link (e.g. a Google job posting) returns
  // to that exact screen after login; App validates the target again before using it.
  useEffect(() => { rememberReturnTarget(); }, []);

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
    markAuthAttempt();
    track('hc_auth_start', { method: 'google', screen: isSignup ? 'signup' : 'login' });
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
      markAuthAttempt();
      track('hc_auth_start', { method: 'email', screen: isSignup ? 'signup' : 'login' });
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
            {promise
              ? <><h1>{promise.title}</h1><p>{promise.body}</p></>
              : <><h1>自分に合う保育園と、<br />もっと自然につながる。</h1><p>求人の保存、応募、見学・体験勤務まで。あなたの転職活動をHoiku Colorでまとめて管理できます。</p></>}
            <div className="hc-auth-pills"><span>求人検索</span><span>気になる保存</span><span>応募管理</span></div>
          </div>
        </aside>

        <section className="hc-auth-main">
          <div className="hc-auth-mobile-logo"><Brand /></div>
          <div className="hc-auth-role">求職者専用</div>
          <header className="hc-auth-heading">
            <span>求職者</span>
            <h2>{isSignup ? '求職者アカウントを作成' : '求職者ログイン'}</h2>
            {promise && <p className="hc-auth-promise">{promise.title}</p>}
            <p>{isSignup || promise ? '登録は無料です。' : ''}Googleアカウントまたはメールアドレスで続けられます。</p>
          </header>

          {handoff && <p className="hc-auth-handoff" role="note">ホームページで選んだ保育観（{handoff.childcareValues.join('・')}）は、ログイン後に確認してから保存できます。</p>}

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

/* An attempt started on the login screen lets AuthGate tell a fresh login from a restored
   session. sessionStorage survives the same-tab Google redirect. */
const authAttemptKey = 'hc_auth_attempt_v1';
function markAuthAttempt() {
  try { sessionStorage.setItem(authAttemptKey, String(Date.now())); } catch { /* ignore */ }
}
function consumeAuthAttempt() {
  try {
    const value = sessionStorage.getItem(authAttemptKey);
    sessionStorage.removeItem(authAttemptKey);
    return Boolean(value);
  } catch {
    return false;
  }
}
