import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, [
  '--experimental-strip-types', '--test', 'qa/native-spot-read-integrity.test.mjs',
], { cwd: process.cwd(), encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.error) throw result.error;
process.exit(result.status ?? 1);
