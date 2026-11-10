// Run with node qa/native-visit-request-readback-contract.mjs from native/.
// Full-source wiring contract; unit tests alone cannot prove the API uses this guard.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapter = readFileSync(path.join(root, 'src/lib/applicationJourneyApi.ts'), 'utf8');
assert.match(adapter, /import \{ confirmsRequestedVisit \} from '\.\/visitRequestReadback'/);
assert.match(adapter, /const visits = await listCandidateVisits\(params\.client\);\s*if \(!confirmsRequestedVisit\(visits, \{/);
assert.match(adapter, /candidateMessage: message,[\s\S]*?\}\)\) \{[\s\S]*?再送信せず予約履歴/);
assert.match(adapter, /再送信せず予約履歴[\s\S]*?\n\s*\}\s*await clearDurableMutation/);
const testResult = spawnSync(process.execPath,
  ['--experimental-strip-types', '--test', 'qa/native-visit-request-readback.test.mjs'],
  { cwd: root, encoding: 'utf8' });
if (testResult.status !== 0) {
  process.stderr.write(testResult.stdout + testResult.stderr);
  throw new Error('Visit request canonical readback tests failed');
}
console.log('PASS: request adapter source wiring plus 5 focused behavioral tests');
