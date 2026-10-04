import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../src/contexts/AccountDeletionContext.tsx', import.meta.url),
  'utf8',
).replace(/\r\n/g, '\n');

const start = source.indexOf('  const requestDeletion = useCallback(async () => {');
const end = source.indexOf('  const cancelDeletion = useCallback(async () => {');
if (start < 0 || end < 0 || end <= start) {
  throw new Error('ACCOUNT_DELETION_RECONCILIATION_CONTRACT_BLOCK_MISSING');
}
const block = source.slice(start, end);

const checks = [
  [
    'account deletion mutation is sent at most once per user action',
    (block.match(/requestAccountDeletion\(pinned\.client\)/g) ?? []).length === 1,
  ],
  [
    'transport failure reconciles canonical deletion state before any retry',
    block.includes('const reconciled = await getAccountDeletionRequest(pinned.client);'),
  ],
  [
    'committed canonical deletion hold is applied through the normal quarantine policy',
    block.includes('return await applyCanonicalRequest(pinned, reconciled);'),
  ],
  [
    'request result unknown does not blindly resend the deletion mutation',
    !block
      .slice(block.indexOf('catch (requestError)'))
      .includes('requestAccountDeletion(pinned.client)'),
  ],
  [
    'double-unknown mutation/read failure fails closed on local candidate state',
    block.includes('await ensureLocalQuarantine(pinned.ownerId).catch(() => undefined);'),
  ],
  [
    'double-unknown path exposes a stable retryable error code',
    block.includes("throw new Error('ACCOUNT_DELETION_REQUEST_RESULT_UNKNOWN');"),
  ],
  [
    'session replacement is checked before canonical reconciliation',
    block.indexOf("if (!pinned.isCurrent()) throw new Error('CANDIDATE_SESSION_CHANGED');") <
      block.indexOf('const reconciled = await getAccountDeletionRequest(pinned.client);'),
  ],
  [
    'ordinary successful request also flows through canonical quarantine policy',
    block.includes('return await applyCanonicalRequest(pinned, next);'),
  ],
];

let failed = 0;
for (const [name, pass] of checks) {
  if (pass) console.log(`PASS ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

if (failed) {
  throw new Error(`ACCOUNT_DELETION_RECONCILIATION_CONTRACT_FAILED:${failed}/${checks.length}`);
}

console.log(`HC account deletion request reconciliation contract: ${checks.length}/${checks.length} PASS`);
