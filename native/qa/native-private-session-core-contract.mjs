import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const vault = read('src/components/DocumentVaultSection.tsx');
const privacy = read('src/hooks/usePrivateDataQuarantine.ts');
const pinned = read('src/hooks/usePinnedCandidateAction.ts');
const appLock = read('src/contexts/AppLockContext.tsx');
const freshness = read('src/contexts/SessionFreshnessContext.tsx');
const lifecycle = read('src/lib/sessionLifecycle.ts');
const localState = read('src/lib/candidateLocalStateSession.ts');
const localPurge = read('src/lib/candidateLocalPrivacyPurge.ts');
const durable = read('src/lib/durableMutation.ts');

const checks = [];
function check(name, condition) {
  if (!condition) throw new Error(`Native private-session core contract failed: ${name}`);
  checks.push(name);
}

check('document vault consumes private-data quarantine', vault.includes("usePrivateDataQuarantine"));
check('document vault consumes pinned candidate actions', vault.includes("usePinnedCandidateAction"));
check('privacy hook composes biometric/app-lock shield', privacy.includes('useAppLock()'));
check('privacy hook composes foreground session freshness', privacy.includes('useSessionFreshness()'));
check('privacy hook starts imperative shield fail-closed', privacy.includes('const shieldVisibleRef = useRef(true);'));
check('privacy hook requires foreground AppState', privacy.includes("AppState.currentState === 'active'"));
check('pinned action snapshots exact Clerk user and session', pinned.includes('session?.user?.id') && pinned.includes('session?.id'));
check('pinned action snapshots one launch token', pinned.includes('const token = await session.getToken();'));
check('pinned Supabase client cannot lazily retarget accounts', pinned.includes('createNativeSupabase(async () => token)'));
check('pinned action revalidates exact launch session', pinned.includes('current.userId === ownerId') && pinned.includes('current.sessionId === ownerSessionId'));
check('App Lock bootstrap starts fail-closed', appLock.includes('const [loading, setLoading] = useState(true);') && appLock.includes('const [privacyCovered, setPrivacyCovered] = useState(true);'));
check('App Lock requires strong biometric policy', appLock.includes("biometricsSecurityLevel: 'strong'") && appLock.includes('securityLevel') && appLock.includes('>= 3'));
check('App Lock blocks durable and local state before sign-out cleanup', appLock.includes('blockDurableMutationSession') && appLock.includes('blockCandidateLocalStateSession'));
check('App Lock quiesces Push before account handoff', appLock.includes('quiescePushBindingOperations()'));
check('App Lock purges candidate-private local state before sign-out', appLock.includes('purgeCandidatePrivateLocalState(pinned.ownerId)'));
check('App Lock targets the launch Clerk session on sign-out', appLock.includes('signOut({ sessionId: pinned.ownerSessionId })'));
check('foreground freshness forces non-cached Clerk token', lifecycle.includes('getToken({ skipCache: true })'));
check('foreground freshness only refreshes on background-to-active', lifecycle.includes('previous.match(/background|inactive/)') && lifecycle.includes("nextState !== 'active'"));
check('non-offline freshness failure is fail-closed', lifecycle.includes('setBlocked(true)') && lifecycle.includes('SESSION_REFRESH_FAILED'));
check('local state session invalidation is generation-bound', localState.includes('CANDIDATE_LOCAL_STATE_SESSION_CHANGED') && localState.includes('sessionGenerations'));
check('local purge drains saved queue, saved snapshot, durable mutations and picker cache', ['clearOfflineSavedJobs', 'clearOfflineSavedSnapshot', 'clearAllDurableMutations', 'purgePendingDocumentPickerCache'].every((token) => localPurge.includes(token)));
check('durable mutation recovery is owner/session lease bound', durable.includes('DurableMutationSessionLease') && durable.includes('DURABLE_MUTATION_SESSION_CHANGED'));
check('session freshness provider exposes fail-closed shield', freshness.includes('freshness.checking || freshness.blocked'));

console.log(`Native private-session core contract PASS (${checks.length}/${checks.length})`);
