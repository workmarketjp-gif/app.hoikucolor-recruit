import { useLayoutEffect, useMemo } from 'react';
import { App } from '../App';
import { CandidateSessionProvider, type CandidateSession } from '../lib/candidateSession';
import { setSupabaseAccessTokenGetter } from '../lib/supabase';

/**
 * E2E-only root (bundled only by `vite build --mode e2e`). It replaces Clerk with a
 * fixed fixture session; every Supabase RPC is answered by Playwright route mocks,
 * so no real account, token or production data is ever involved.
 */
export default function E2ERoot() {
  useLayoutEffect(() => {
    setSupabaseAccessTokenGetter(async () => 'e2e-fixture-token');
    return () => setSupabaseAccessTokenGetter(null);
  }, []);

  const session = useMemo<CandidateSession>(() => ({
    userId: 'user_e2e_fixture',
    firstName: 'みさき',
    fullName: '保育 みさき',
    email: 'e2e@example.invalid',
    signOut: () => { window.location.assign('/login'); },
  }), []);

  return <CandidateSessionProvider value={session}><App /></CandidateSessionProvider>;
}
