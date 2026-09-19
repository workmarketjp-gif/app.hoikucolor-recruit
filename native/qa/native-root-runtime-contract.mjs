import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const layout = fs.readFileSync(path.join(root, 'src/app/_layout.tsx'), 'utf8');
const deletionContext = fs.readFileSync(path.join(root, 'src/contexts/AccountDeletionContext.tsx'), 'utf8');
const deletionGate = fs.readFileSync(path.join(root, 'src/components/AccountDeletionGate.tsx'), 'utf8');

const checks = [];
const check = (label, ok) => checks.push([label, Boolean(ok)]);
const ordered = (...needles) => {
  let cursor = -1;
  return needles.every((needle) => {
    const index = layout.indexOf(needle, cursor + 1);
    if (index < 0) return false;
    cursor = index;
    return true;
  });
};

check('Expo Router root is materialized under src/app', layout.includes('export default function RootLayout'));
check('Clerk root uses persisted Expo token cache', layout.includes('<ClerkProvider') && layout.includes('tokenCache={tokenCache}'));
check('missing Clerk configuration fails closed', layout.includes('clerk-config-missing') && layout.includes('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY'));
check('picker/camera process-death cache is reconciled before route runtime', layout.includes('<DocumentPickerCacheBoundary>') && layout.indexOf('<DocumentPickerCacheBoundary>') < layout.indexOf('<AuthScopedRuntime'));
check('signed-out runtime excludes Candidate-private providers', layout.includes('if (!auth.isSignedIn) return <RouterStack />;'));
check('private runtime requires an active exact Clerk session', layout.includes('if (!auth.active || !auth.sessionId)'));
check('candidate runtime remounts on exact session handoff', layout.includes('<SessionFreshnessProvider key={auth.sessionId}>'));
check(
  'provider order enforces session then App Lock then deletion then notification',
  ordered(
    '<SessionFreshnessProvider key={auth.sessionId}>',
    '<AppLockProvider>',
    '<AccountDeletionProvider>',
    '<AccountDeletionBoundary>',
    '<NotificationProvider>',
    '<RouterStack />',
  ),
);

check('deletion state reuses canonical API helpers', deletionContext.includes('getAccountDeletionRequest') && deletionContext.includes('requestAccountDeletion') && deletionContext.includes('cancelAccountDeletion'));
check('deletion status read/cancel work while private business gate is closed', deletionContext.includes('const pinned = await pinCandidateSession()'));
check('new deletion request requires a private Candidate action', deletionContext.includes('const pinned = await pinCandidateAction()'));
check('async deletion state is pinned to exact Candidate session', deletionContext.includes('pinned.isCurrent()') && deletionContext.includes('refreshGeneration'));
check('deletion hold quarantines Candidate local state', deletionContext.includes('purgeCandidatePrivateLocalState(ownerId)'));
check('deletion hold quiesces and clears local Push presentation', deletionContext.includes('quiescePushBindingOperations()') && deletionContext.includes('quarantineLocalPushIdentity(generation'));
check('clean canonical deletion state is required before Push binder reopens', deletionContext.includes('policy.quarantineCandidateDeviceState') && deletionContext.includes('releaseLocalQuarantine()') && deletionContext.includes('unblockPushBindingOperations'));
check('safe signout blocks stale durable and saved-state writes', deletionContext.includes('blockDurableMutationSession') && deletionContext.includes('blockCandidateLocalStateSession'));
check('safe signout targets exact Clerk session', deletionContext.includes('signOut({ sessionId: pinned.ownerSessionId })'));
check('safe signout attempts canonical Push revoke', deletionContext.includes('revokePush(pinned.client)'));
check('account deletion runtime does not duplicate HC business tables', !deletionContext.includes(".from('hc_") && !deletionContext.includes('from("hc_'));
check('unknown deletion status fails closed instead of revealing business UI', deletionGate.includes('account-deletion-status-blocked') && deletionGate.indexOf('account-deletion-status-blocked') < deletionGate.indexOf('if (!policy.blocksBusinessUi)'));

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
if (failed.length) {
  console.error(`Native root runtime contract failed (${checks.length - failed.length}/${checks.length}).`);
  process.exit(1);
}
console.log(`Native root runtime contract PASS (${checks.length}/${checks.length})`);
