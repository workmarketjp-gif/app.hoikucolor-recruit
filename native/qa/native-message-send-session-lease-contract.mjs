// Auto-discovered by run-native-contracts.mjs. Exercises actual TS helper with Node 22.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-message-send-session-lease.test.mjs',
], { cwd: root, encoding: 'utf8' });
if (run.status !== 0) {
  process.stderr.write(run.stdout + run.stderr);
  throw new Error('Candidate message send session-lease regression failed');
}
console.log('PASS candidate message send session-lease behavioral tests');
