// Run from native/: node qa/native-visit-request-readback-contract.mjs.
// Verify exact canonical readback AND the new session lease across each async phase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const adapter = read('src/lib/applicationJourneyApi.ts');
const screen = read('src/app/visits.tsx');
const helper = read('src/lib/visitRequestSessionLease.ts');

assert.match(adapter, /import \{ confirmsRequestedVisit \} from '\.\/visitRequestReadback'/);
assert.match(adapter, /import \{ requestCandidateVisitWithLease \} from '\.\/visitRequestSessionLease'/);
assert.match(adapter, /isCurrent: \(\) => boolean;[\s\S]*?jobId: string/);
assert.match(adapter, /return requestCandidateVisitWithLease\(\{/);
assert.match(adapter, /isCurrent: params\.isCurrent/);
assert.match(adapter, /prepare: async \(\) => \{[\s\S]*?prepareDurableMutation\(/);
assert.match(adapter, /invoke: async \(requestId\) => \{[\s\S]*?p_client_request_id: requestId/);
assert.match(adapter, /readVisits: \(\) => listCandidateVisits\(params\.client\)/);
assert.match(adapter, /confirms: \(visits, reservationId\) => confirmsRequestedVisit\(visits, \{/);
assert.match(adapter, /clear: \(\) => clearDurableMutation\(\{ userId: params\.ownerId, kind: 'visit', scopeId \}\)/);
assert.match(screen, /requestVisitDurable\(\{[\s\S]*?isCurrent: pinned\.isCurrent/);
assert.match(helper, /const prepared = await params\.prepare\(\);[\s\S]*?assertCurrent\(\);[\s\S]*?const receipt = await params\.invoke\(prepared\)/);
assert.match(helper, /const history = await params\.readVisits\(\);[\s\S]*?assertCurrent\(\);[\s\S]*?if \(!params\.confirms\(history, receipt\)\)/);
assert.match(helper, /if \(!params\.confirms\(history, receipt\)\)[\s\S]*?assertCurrent\(\);[\s\S]*?await params\.clear\(\)/);
const child = spawnSync(process.execPath,
  ['--experimental-strip-types', '--test',
    'qa/native-visit-request-readback.test.mjs',
    'qa/native-visit-request-session-lease.test.mjs'],
  { cwd: root, encoding: 'utf8' });
if (child.status !== 0) {
  process.stderr.write(child.stdout + child.stderr);
  throw new Error('Canonical visit/request session regression tests failed');
}
console.log('PASS: visit request API source wiring, canonical proof (5), and session lease (10)');
